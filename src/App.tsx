/**
 * IoT Smart Home Dashboard
 * Features: MQTT relay control, DHT11 sensor, Voice Command, Telegram Notification
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RelayState {
  1: boolean;
  2: boolean;
  3: boolean;
  4: boolean;
}

interface SensorData {
  temp: number | null;
  hum: number | null;
  updatedAt: string | null;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface VoiceLog {
  id: number;
  text: string;
  result: string;
  ok: boolean;
  time: string;
}

type MqttClient = any;

// ─── MQTT Loader (script tag) ─────────────────────────────────────────────────

function loadMqttScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).mqtt) return resolve();
    const s = document.createElement("script");
    s.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ─── Telegram Helper ──────────────────────────────────────────────────────────

async function sendTelegram(cfg: TelegramConfig, text: string): Promise<boolean> {
  if (!cfg.botToken || !cfg.chatId) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Voice Command Parser ─────────────────────────────────────────────────────

interface ParsedCommand {
  type: "relay" | "all" | "sensor" | "unknown";
  relayId?: number;
  state?: boolean;
}

function parseVoiceCommand(text: string): ParsedCommand {
  const t = text.toLowerCase().trim();

  // "lampu semua mati / matikan semua"
  if (/semua\s*(mati|matikan|off)|matikan\s*semua/.test(t)) {
    return { type: "all", state: false };
  }
  // "lampu semua nyala / nyalakan semua"
  if (/semua\s*(nyala|nyalakan|on)|nyalakan\s*semua/.test(t)) {
    return { type: "all", state: true };
  }
  // "cek suhu / sensor"
  if (/suhu|kelembaban|sensor|temperature/.test(t)) {
    return { type: "sensor" };
  }

  // "nyalakan / matikan lampu 1..4"
  const relayMap: Record<string, number> = {
    satu: 1, "1": 1, pertama: 1,
    dua: 2, "2": 2, kedua: 2,
    tiga: 3, "3": 3, ketiga: 3,
    empat: 4, "4": 4, keempat: 4,
  };

  for (const [word, id] of Object.entries(relayMap)) {
    const onPattern = new RegExp(
      `(nyala|nyalakan|on|hidupkan|aktifkan).*lampu.*${word}|lampu.*${word}.*(nyala|nyalakan|on|hidup|aktif)`
    );
    const offPattern = new RegExp(
      `(mati|matikan|off|padamkan|nonaktifkan).*lampu.*${word}|lampu.*${word}.*(mati|matikan|off|padam|nonaktif)`
    );
    if (onPattern.test(t)) return { type: "relay", relayId: id, state: true };
    if (offPattern.test(t)) return { type: "relay", relayId: id, state: false };
  }

  return { type: "unknown" };
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [connected, setConnected] = useState(false);
  const [relays, setRelays] = useState<RelayState>({ 1: false, 2: false, 3: false, 4: false });
  const [pending, setPending] = useState<RelayState>({ 1: false, 2: false, 3: false, 4: false });
  const [sensor, setSensor] = useState<SensorData>({ temp: null, hum: null, updatedAt: null });
  const [variasi, setVariasi] = useState(0);

  // Telegram config
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [showTgSetup, setShowTgSetup] = useState(false);
  const [tgStatus, setTgStatus] = useState<"idle" | "sending" | "ok" | "fail">("idle");

  // Voice
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const logIdRef = useRef(0);

  const mqttRef = useRef<MqttClient>(null);

  const TOPICS = {
    status: "iot/rumah/relay/status",
    command: "iot/rumah/relay/command",
    allCommand: "iot/rumah/relay/allcommand",
    sensor: "iot/rumah/sensor/data",
    variasiStatus: "iot/rumah/variasi/status",
    variasiCommand: "iot/rumah/variasi/command",
  };

  // ── Telegram notify ──────────────────────────────────────────────────────

  const notify = useCallback(
    async (msg: string) => {
      if (!tgToken || !tgChatId) return;
      setTgStatus("sending");
      const ok = await sendTelegram({ botToken: tgToken, chatId: tgChatId }, msg);
      setTgStatus(ok ? "ok" : "fail");
      setTimeout(() => setTgStatus("idle"), 2000);
    },
    [tgToken, tgChatId]
  );

  // ── MQTT ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let client: MqttClient;
    loadMqttScript().then(() => {
      const mqtt = (window as any).mqtt;
      client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
        clientId: "web_" + Math.random().toString(16).slice(2, 10),
        reconnectPeriod: 3000,
      });

      client.on("connect", () => {
        setConnected(true);
        client.subscribe([TOPICS.status, TOPICS.sensor, TOPICS.variasiStatus]);
      });

      client.on("close", () => setConnected(false));

      client.on("message", (topic: string, message: Buffer) => {
        try {
          const payload = JSON.parse(message.toString());
          if (topic === TOPICS.status) {
            setRelays((prev) => {
              const next = { ...prev };
              for (let i = 1; i <= 4; i++) {
                const k = `relay${i}` as keyof typeof payload;
                if (payload[k] !== undefined)
                  (next as any)[i] =
                    payload[k] === true || String(payload[k]) === "true";
              }
              return next;
            });
            setPending({ 1: false, 2: false, 3: false, 4: false });
          } else if (topic === TOPICS.sensor) {
            setSensor({
              temp: payload.suhu !== undefined ? parseFloat(payload.suhu) : null,
              hum:
                payload.kelembaban !== undefined
                  ? parseFloat(payload.kelembaban)
                  : null,
              updatedAt: new Date().toLocaleTimeString("id-ID"),
            });
          } else if (topic === TOPICS.variasiStatus) {
            if (payload.variasi !== undefined) setVariasi(parseInt(payload.variasi));
          }
        } catch (_) {}
      });

      mqttRef.current = client;
    });

    return () => {
      client?.end();
    };
  }, []);

  // ── Relay toggle ──────────────────────────────────────────────────────────

  const toggleRelay = useCallback(
    (id: number) => {
      if (!connected || (pending as any)[id] || variasi > 0) return;
      const next = !(relays as any)[id];
      setPending((p) => ({ ...p, [id]: true }));
      mqttRef.current?.publish(TOPICS.command, JSON.stringify({ relay: id, state: next }));
      setTimeout(() => setPending((p) => ({ ...p, [id]: false })), 5000);

      const emoji = next ? "💡" : "🔴";
      notify(`${emoji} <b>Web Interface</b>\nLampu ${id} → ${next ? "MENYALA" : "MATI"}`);
    },
    [connected, pending, relays, variasi, notify]
  );

  const setAll = useCallback(
    (state: boolean) => {
      if (!connected || variasi > 0) return;
      mqttRef.current?.publish(TOPICS.allCommand, JSON.stringify({ state }));
      setPending({ 1: true, 2: true, 3: true, 4: true });
      setTimeout(() => setPending({ 1: false, 2: false, 3: false, 4: false }), 5000);
      const emoji = state ? "💡" : "🔴";
      notify(`${emoji} <b>Web Interface</b>\nSemua lampu → ${state ? "MENYALA" : "MATI"}`);
    },
    [connected, variasi, notify]
  );

  const setVariasiCmd = useCallback(
    (v: number) => {
      if (!connected) return;
      mqttRef.current?.publish(TOPICS.variasiCommand, JSON.stringify({ variasi: v }));
    },
    [connected]
  );

  // ── Voice Command ─────────────────────────────────────────────────────────

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); return; }

    const recognition = new SR();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e: any) => {
      const results = Array.from(e.results as SpeechRecognitionResultList);
      const interim = results.map((r: any) => r[0].transcript).join(" ");
      setTranscript(interim);

      if (e.results[e.results.length - 1].isFinal) {
        const final = interim;
        const cmd = parseVoiceCommand(final);
        let resultMsg = "";
        let ok = false;

        if (cmd.type === "relay" && cmd.relayId !== undefined) {
          toggleRelay(cmd.relayId);
          resultMsg = `✓ Lampu ${cmd.relayId} → ${cmd.state ? "ON" : "OFF"}`;
          ok = true;
          notify(
            `🎤 <b>Perintah Suara</b>\nLampu ${cmd.relayId} → ${cmd.state ? "MENYALA" : "MATI"}\nTeks: "${final}"`
          );
        } else if (cmd.type === "all") {
          setAll(cmd.state!);
          resultMsg = `✓ Semua lampu → ${cmd.state ? "ON" : "OFF"}`;
          ok = true;
          notify(
            `🎤 <b>Perintah Suara</b>\nSemua lampu → ${cmd.state ? "MENYALA" : "MATI"}\nTeks: "${final}"`
          );
        } else if (cmd.type === "sensor") {
          resultMsg = `✓ Suhu: ${sensor.temp ?? "--"}°C, Kelembaban: ${sensor.hum ?? "--"}%`;
          ok = true;
        } else {
          resultMsg = `✗ Perintah tidak dikenal`;
          ok = false;
        }

        logIdRef.current += 1;
        setVoiceLogs((prev) =>
          [
            {
              id: logIdRef.current,
              text: final,
              result: resultMsg,
              ok,
              time: new Date().toLocaleTimeString("id-ID"),
            },
            ...prev,
          ].slice(0, 5)
        );
        setTranscript("");
      }
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
  }, [toggleRelay, setAll, sensor, notify]);

  const toggleListen = () => {
    if (!voiceSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    } else {
      setTranscript("");
      recognitionRef.current?.start();
      setListening(true);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const tgConfigured = tgToken.length > 5 && tgChatId.length > 3;

  return (
    <div style={{ fontFamily: "'Syne', 'Space Grotesk', sans-serif" }} className="min-h-screen bg-[#080C12] text-white">
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* ── Header ── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              IoT Smart Home
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 tracking-widest uppercase">
              ESP32 · DHT11 · MQTT
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Telegram badge */}
            <button
              onClick={() => setShowTgSetup(!showTgSetup)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                tgConfigured
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                  : "border-slate-700 bg-slate-800/50 text-slate-500"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
              </svg>
              {tgConfigured ? "Telegram ✓" : "Telegram"}
            </button>
            {/* Connection badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                connected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-red-900/40 bg-red-900/10 text-red-400"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
              {connected ? "Online" : "Offline"}
            </div>
          </div>
        </header>

        {/* ── Telegram Setup Panel ── */}
        {showTgSetup && (
          <div className="bg-[#0F1620] border border-sky-900/40 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sky-300 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
                </svg>
                Konfigurasi Telegram Bot
              </h2>
              <button onClick={() => setShowTgSetup(false)} className="text-slate-500 hover:text-white text-lg">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 tracking-wide">BOT TOKEN</label>
                <input
                  type="password"
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  placeholder="123456789:ABCDefgh..."
                  className="w-full bg-[#080C12] border border-slate-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 tracking-wide">CHAT ID</label>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="-100123456789"
                  className="w-full bg-[#080C12] border border-slate-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Buat bot via <b className="text-slate-300">@BotFather</b> → ambil token. Dapatkan Chat ID dari <b className="text-slate-300">@userinfobot</b>.
            </p>
            <button
              onClick={async () => {
                const ok = await sendTelegram(
                  { botToken: tgToken, chatId: tgChatId },
                  "✅ <b>IoT Smart Home</b>\nKoneksi Telegram berhasil dikonfigurasi!"
                );
                alert(ok ? "✓ Test notifikasi berhasil!" : "✗ Gagal — cek token & chat ID");
              }}
              className="w-full py-2.5 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 text-sm font-semibold hover:bg-sky-500/30 transition-all"
            >
              Test Kirim Notifikasi
            </button>
          </div>
        )}

        {/* ── Sensor Card ── */}
        <div className="bg-[#0F1620] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase">Sensor DHT11</h2>
            <span className="text-[10px] text-slate-600">
              {sensor.updatedAt ? `Diperbarui ${sensor.updatedAt}` : "Menunggu data..."}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Suhu */}
            <div className={`rounded-xl p-4 border transition-all ${
              sensor.temp !== null && sensor.temp >= 35
                ? "bg-red-900/20 border-red-700/40"
                : "bg-slate-800/40 border-slate-700/30"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  sensor.temp !== null && sensor.temp >= 35 ? "bg-red-500/20" : "bg-orange-500/20"
                }`}>
                  <svg className={`w-4 h-4 ${sensor.temp !== null && sensor.temp >= 35 ? "text-red-400" : "text-orange-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                  </svg>
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Suhu</span>
              </div>
              <p className="text-3xl font-extrabold text-white">
                {sensor.temp !== null ? sensor.temp : "--"}
                <span className="text-sm font-normal text-slate-400 ml-1">°C</span>
              </p>
              {sensor.temp !== null && sensor.temp >= 35 && (
                <p className="text-[10px] text-red-400 mt-1.5 font-medium">⚠ Suhu kritis!</p>
              )}
            </div>
            {/* Kelembaban */}
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                </div>
                <span className="text-xs text-slate-500 uppercase tracking-wider">Kelembaban</span>
              </div>
              <p className="text-3xl font-extrabold text-white">
                {sensor.hum !== null ? sensor.hum : "--"}
                <span className="text-sm font-normal text-slate-400 ml-1">%</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Voice Command Card ── */}
        <div className={`border rounded-2xl p-5 transition-all ${
          listening
            ? "bg-violet-900/20 border-violet-500/50 shadow-[0_0_30px_rgba(139,92,246,0.15)]"
            : "bg-[#0F1620] border-slate-800"
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase">Perintah Suara</h2>
              {!voiceSupported && (
                <p className="text-[11px] text-red-400 mt-0.5">Browser tidak mendukung Speech Recognition</p>
              )}
            </div>
            {/* Mic button */}
            <button
              onClick={toggleListen}
              disabled={!voiceSupported || !connected}
              className={`relative w-14 h-14 rounded-full flex items-center justify-center font-bold transition-all ${
                !voiceSupported || !connected
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                  : listening
                  ? "bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)]"
                  : "bg-slate-700 hover:bg-violet-600 text-white"
              }`}
            >
              {listening && (
                <span className="absolute inset-0 rounded-full border-2 border-violet-400 animate-ping opacity-50" />
              )}
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z"/>
              </svg>
            </button>
          </div>

          {/* Transcript live */}
          {listening && (
            <div className="mb-3 px-4 py-3 rounded-xl bg-violet-900/30 border border-violet-700/30 min-h-[44px]">
              <p className="text-sm text-violet-300 italic">
                {transcript || "Mendengarkan..."}
              </p>
            </div>
          )}

          {/* Contoh perintah */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              "Nyalakan lampu satu",
              "Matikan lampu dua",
              "Nyalakan semua",
              "Matikan semua",
              "Cek suhu",
            ].map((cmd) => (
              <span
                key={cmd}
                className="text-[10px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700"
              >
                "{cmd}"
              </span>
            ))}
          </div>

          {/* Voice Logs */}
          {voiceLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Riwayat</p>
              {voiceLogs.map((log) => (
                <div key={log.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-xs ${
                  log.ok ? "bg-emerald-900/10 border-emerald-800/30" : "bg-red-900/10 border-red-800/30"
                }`}>
                  <span className="mt-0.5 text-base">{log.ok ? "✓" : "✗"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 truncate">"{log.text}"</p>
                    <p className={`mt-0.5 ${log.ok ? "text-emerald-400" : "text-red-400"}`}>{log.result}</p>
                  </div>
                  <span className="text-slate-600 shrink-0">{log.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Relay Grid ── */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3 px-1">Kontrol Relay</h2>
          <div className="grid grid-cols-2 gap-3">
            {([1, 2, 3, 4] as const).map((id) => {
              const isOn = relays[id];
              const isPending = pending[id];
              const disabled = !connected || isPending || variasi > 0;
              return (
                <button
                  key={id}
                  onClick={() => toggleRelay(id)}
                  disabled={disabled}
                  className={`group relative rounded-2xl p-5 text-left border transition-all duration-300 ${
                    isOn
                      ? "bg-amber-500/10 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                      : "bg-[#0F1620] border-slate-800 hover:border-slate-600"
                  } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {/* Lamp icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all ${
                    isOn ? "bg-amber-400/20" : "bg-slate-700/50"
                  }`}>
                    {isPending ? (
                      <svg className="w-5 h-5 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <svg className={`w-5 h-5 ${isOn ? "text-amber-400" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white mb-0.5">Lampu {id}</p>
                  <p className={`text-xs font-medium ${isOn ? "text-amber-400" : "text-slate-600"}`}>
                    {isPending ? "Menunggu..." : isOn ? "● Menyala" : "○ Mati"}
                  </p>
                  {/* Glow dot */}
                  {isOn && (
                    <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Global Controls ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setAll(true)}
            disabled={!connected || variasi > 0}
            className="py-3.5 rounded-xl font-semibold text-sm border border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Semua ON
          </button>
          <button
            onClick={() => setAll(false)}
            disabled={!connected || variasi > 0}
            className="py-3.5 rounded-xl font-semibold text-sm border border-red-900/40 bg-red-900/10 hover:bg-red-900/20 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Semua OFF
          </button>
        </div>

        {/* ── Variasi ── */}
        <div>
          <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3 px-1">Variasi Lampu</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: 1, label: "▶ Variasi 1" },
              { v: 2, label: "▶ Variasi 2" },
              { v: 0, label: "⏹ Stop" },
            ].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setVariasiCmd(v)}
                disabled={!connected}
                className={`py-3 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40 ${
                  variasi === v && v > 0
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                    : "bg-[#0F1620] border-slate-800 text-slate-400 hover:border-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Telegram notify status toast ── */}
        {tgStatus !== "idle" && (
          <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-xl text-xs font-semibold border shadow-lg transition-all ${
            tgStatus === "sending"
              ? "bg-slate-800 border-slate-700 text-slate-400"
              : tgStatus === "ok"
              ? "bg-emerald-900/80 border-emerald-700/50 text-emerald-300"
              : "bg-red-900/80 border-red-700/50 text-red-300"
          }`}>
            {tgStatus === "sending" && "📤 Mengirim notifikasi..."}
            {tgStatus === "ok" && "✓ Notifikasi terkirim"}
            {tgStatus === "fail" && "✗ Gagal kirim notifikasi"}
          </div>
        )}

      </div>
    </div>
  );
}
