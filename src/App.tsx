/**
 * IoT Smart Home Dashboard — Redesigned
 * Aesthetic: Neon-Cyberpunk / Holographic Dark
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

// ─── MQTT Loader ──────────────────────────────────────────────────────────────

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
  type: "relay" | "all" | "sensor_temp" | "sensor_hum" | "sensor" | "variasi" | "unknown";
  relayId?: number;
  state?: boolean;
  variasiId?: number;
}

function parseVoiceCommand(text: string): ParsedCommand {
  const t = text.toLowerCase().trim();
  if (/berapa\s*(temperatur|suhu|temperature|panas)|suhu\s*(sekarang|saat ini|berapa)/.test(t)) return { type: "sensor_temp" };
  if (/berapa\s*(kelembap|kelembab|humidity|lembab)|kelembap(an)?\s*(sekarang|berapa)/.test(t)) return { type: "sensor_hum" };
  if (/cek\s*(suhu|sensor|temperature|kelembab|kelembap)|sensor\s*(suhu|data)/.test(t)) return { type: "sensor" };
  if (/(nyalakan|aktifkan|jalankan|hidupkan|mulai)\s*(variasi|mode)\s*(1|satu|pertama)/.test(t) || /variasi\s*(1|satu)\s*(on|nyala|aktif)/.test(t)) return { type: "variasi", variasiId: 1, state: true };
  if (/(nyalakan|aktifkan|jalankan|hidupkan|mulai)\s*(variasi|mode)\s*(2|dua|kedua)/.test(t) || /variasi\s*(2|dua)\s*(on|nyala|aktif)/.test(t)) return { type: "variasi", variasiId: 2, state: true };
  if (/(matikan|hentikan|stop|off)\s*(variasi|semua\s*variasi)|variasi\s*(off|mati|stop)/.test(t)) return { type: "variasi", variasiId: 0, state: false };
  if (/semua\s*(mati|matikan|off)|matikan\s*semua|(padamkan|nonaktifkan)\s*semua/.test(t)) return { type: "all", state: false };
  if (/semua\s*(nyala|nyalakan|on)|nyalakan\s*semua|(hidupkan|aktifkan)\s*semua/.test(t)) return { type: "all", state: true };
  if (/^(nyalakan|hidupkan|aktifkan)\s*lampu$/.test(t) || /^lampu\s*(on|nyala|hidup)$/.test(t)) return { type: "all", state: true };
  if (/^(matikan|padamkan|nonaktifkan)\s*lampu$/.test(t) || /^lampu\s*(off|mati|padam)$/.test(t)) return { type: "all", state: false };
  const relayMap: Record<string, number> = { satu: 1, "1": 1, pertama: 1, dua: 2, "2": 2, kedua: 2, tiga: 3, "3": 3, ketiga: 3, empat: 4, "4": 4, keempat: 4 };
  for (const [word, id] of Object.entries(relayMap)) {
    const onPat = new RegExp(`(nyala|nyalakan|on|hidupkan|aktifkan).{0,10}lampu.{0,6}${word}|lampu.{0,6}${word}.{0,10}(nyala|nyalakan|on|hidup|aktif)`);
    const offPat = new RegExp(`(mati|matikan|off|padamkan|nonaktifkan).{0,10}lampu.{0,6}${word}|lampu.{0,6}${word}.{0,10}(mati|matikan|off|padam|nonaktif)`);
    if (onPat.test(t)) return { type: "relay", relayId: id, state: true };
    if (offPat.test(t)) return { type: "relay", relayId: id, state: false };
  }
  return { type: "unknown" };
}

// ─── Global Styles ────────────────────────────────────────────────────────────

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&display=swap');

  :root {
    --neon-cyan: #00f5ff;
    --neon-magenta: #ff006e;
    --neon-amber: #ffbe0b;
    --neon-green: #06ffa5;
    --neon-purple: #8b5cf6;
    --bg-deep: #020510;
    --bg-panel: #050d1a;
    --bg-card: #080f20;
    --border-glow: rgba(0, 245, 255, 0.12);
    --text-dim: #4a5a7a;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg-deep);
    font-family: 'Rajdhani', sans-serif;
    overflow-x: hidden;
  }

  .scanline {
    pointer-events: none;
    position: fixed;
    inset: 0;
    z-index: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 245, 255, 0.015) 2px,
      rgba(0, 245, 255, 0.015) 4px
    );
  }

  .grid-bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    background-image:
      linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .corner-accent::before,
  .corner-accent::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
  }
  .corner-accent::before {
    top: 0; left: 0;
    border-top: 2px solid var(--neon-cyan);
    border-left: 2px solid var(--neon-cyan);
  }
  .corner-accent::after {
    bottom: 0; right: 0;
    border-bottom: 2px solid var(--neon-cyan);
    border-right: 2px solid var(--neon-cyan);
  }

  @keyframes neon-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes data-flow {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  @keyframes flicker {
    0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; }
    20%, 24%, 55% { opacity: 0.4; }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes pulse-ring {
    0% { transform: scale(0.85); opacity: 0.8; }
    70% { transform: scale(1.3); opacity: 0; }
    100% { transform: scale(0.85); opacity: 0; }
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes glow-breathe {
    0%, 100% { box-shadow: 0 0 10px rgba(0,245,255,0.3), 0 0 30px rgba(0,245,255,0.1); }
    50% { box-shadow: 0 0 20px rgba(0,245,255,0.6), 0 0 60px rgba(0,245,255,0.2); }
  }
  @keyframes heat-wave {
    0%, 100% { box-shadow: 0 0 10px rgba(255,0,110,0.3), inset 0 0 15px rgba(255,0,110,0.05); }
    50% { box-shadow: 0 0 25px rgba(255,0,110,0.7), inset 0 0 30px rgba(255,0,110,0.1); }
  }

  .relay-on {
    animation: glow-breathe 2s ease-in-out infinite;
  }
  .relay-off:hover {
    border-color: rgba(0,245,255,0.3) !important;
    box-shadow: 0 0 15px rgba(0,245,255,0.1);
  }
  .mic-active {
    animation: glow-breathe 1s ease-in-out infinite;
  }
  .temp-critical {
    animation: heat-wave 1.5s ease-in-out infinite;
  }
  .neon-text {
    text-shadow: 0 0 10px currentColor, 0 0 30px currentColor;
  }
  .title-glow {
    text-shadow:
      0 0 10px rgba(0,245,255,0.8),
      0 0 40px rgba(0,245,255,0.4),
      0 0 80px rgba(0,245,255,0.2);
  }
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

const HexBadge = ({ active, children, color = "cyan" }: { active: boolean; children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    cyan: active ? "border-[#00f5ff]/40 bg-[#00f5ff]/10 text-[#00f5ff]" : "border-[#1a2a3a] bg-[#050d1a] text-[#4a5a7a]",
    green: active ? "border-[#06ffa5]/40 bg-[#06ffa5]/10 text-[#06ffa5]" : "border-[#1a2a3a] bg-[#050d1a] text-[#4a5a7a]",
    red: "border-[#ff006e]/40 bg-[#ff006e]/10 text-[#ff006e]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-sm tracking-widest transition-all uppercase ${colors[color] || colors.cyan}`}
      style={{ fontFamily: "'Orbitron', monospace", letterSpacing: "0.1em" }}>
      {children}
    </span>
  );
};

const DataLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-[rgba(0,245,255,0.05)]">
    <span className="text-[10px] tracking-widest uppercase text-[#2a3a5a]" style={{ fontFamily: "'Orbitron', monospace" }}>{label}</span>
    <span className="text-xs text-[#00f5ff] font-medium" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{value}</span>
  </div>
);

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [connected, setConnected] = useState(false);
  const [relays, setRelays] = useState<RelayState>({ 1: false, 2: false, 3: false, 4: false });
  const [pending, setPending] = useState<RelayState>({ 1: false, 2: false, 3: false, 4: false });
  const [sensor, setSensor] = useState<SensorData>({ temp: null, hum: null, updatedAt: null });
  const [variasi, setVariasi] = useState(0);

  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [showTgSetup, setShowTgSetup] = useState(false);
  const [tgStatus, setTgStatus] = useState<"idle" | "sending" | "ok" | "fail">("idle");

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const logIdRef = useRef(0);
  const mqttRef = useRef<MqttClient>(null);

  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const TOPICS = {
    status: "iot/rumah/relay/status",
    command: "iot/rumah/relay/command",
    allCommand: "iot/rumah/relay/allcommand",
    sensor: "iot/rumah/sensor/data",
    variasiStatus: "iot/rumah/variasi/status",
    variasiCommand: "iot/rumah/variasi/command",
  };

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
                if (payload[k] !== undefined) (next as any)[i] = payload[k] === true || String(payload[k]) === "true";
              }
              return next;
            });
            setPending({ 1: false, 2: false, 3: false, 4: false });
          } else if (topic === TOPICS.sensor) {
            setSensor({
              temp: payload.suhu !== undefined ? parseFloat(payload.suhu) : null,
              hum: payload.kelembaban !== undefined ? parseFloat(payload.kelembaban) : null,
              updatedAt: new Date().toLocaleTimeString("id-ID"),
            });
          } else if (topic === TOPICS.variasiStatus) {
            if (payload.variasi !== undefined) setVariasi(parseInt(payload.variasi));
          }
        } catch (_) {}
      });
      mqttRef.current = client;
    });
    return () => { client?.end(); };
  }, []);

  const toggleRelay = useCallback((id: number) => {
    if (!connected || (pending as any)[id] || variasi > 0) return;
    const next = !(relays as any)[id];
    setPending((p) => ({ ...p, [id]: true }));
    mqttRef.current?.publish(TOPICS.command, JSON.stringify({ relay: id, state: next }));
    setTimeout(() => setPending((p) => ({ ...p, [id]: false })), 5000);
    notify(`${next ? "💡" : "🔴"} <b>Web Interface</b>\nLampu ${id} → ${next ? "MENYALA" : "MATI"}`);
  }, [connected, pending, relays, variasi, notify]);

  const setAll = useCallback((state: boolean) => {
    if (!connected || variasi > 0) return;
    mqttRef.current?.publish(TOPICS.allCommand, JSON.stringify({ state }));
    setPending({ 1: true, 2: true, 3: true, 4: true });
    setTimeout(() => setPending({ 1: false, 2: false, 3: false, 4: false }), 5000);
    notify(`${state ? "💡" : "🔴"} <b>Web Interface</b>\nSemua lampu → ${state ? "MENYALA" : "MATI"}`);
  }, [connected, variasi, notify]);

  const setVariasiCmd = useCallback((v: number) => {
    if (!connected) return;
    mqttRef.current?.publish(TOPICS.variasiCommand, JSON.stringify({ variasi: v }));
  }, [connected]);

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
        let resultMsg = ""; let ok = false;
        if (cmd.type === "relay" && cmd.relayId !== undefined) {
          toggleRelay(cmd.relayId); resultMsg = `Lampu ${cmd.relayId} → ${cmd.state ? "ON" : "OFF"}`; ok = true;
          notify(`🎤 <b>Perintah Suara</b>\nLampu ${cmd.relayId} → ${cmd.state ? "MENYALA" : "MATI"}\nTeks: "${final}"`);
        } else if (cmd.type === "all") {
          setAll(cmd.state!); resultMsg = `Semua lampu → ${cmd.state ? "ON" : "OFF"}`; ok = true;
          notify(`🎤 <b>Perintah Suara</b>\nSemua lampu → ${cmd.state ? "MENYALA" : "MATI"}\nTeks: "${final}"`);
        } else if (cmd.type === "sensor_temp") { resultMsg = `Suhu: ${sensor.temp !== null ? sensor.temp + "°C" : "N/A"}`; ok = true; }
        else if (cmd.type === "sensor_hum") { resultMsg = `Kelembapan: ${sensor.hum !== null ? sensor.hum + "%" : "N/A"}`; ok = true; }
        else if (cmd.type === "sensor") { resultMsg = `${sensor.temp ?? "--"}°C | ${sensor.hum ?? "--"}%`; ok = true; }
        else if (cmd.type === "variasi") {
          setVariasiCmd(cmd.variasiId!);
          resultMsg = cmd.variasiId === 0 ? "Variasi dihentikan" : `Variasi ${cmd.variasiId} aktif`; ok = true;
          notify(`🎤 <b>Perintah Suara</b>\n${cmd.variasiId === 0 ? "Variasi dimatikan" : "Variasi " + cmd.variasiId + " aktif"}\nTeks: "${final}"`);
        } else { resultMsg = "Perintah tidak dikenal"; ok = false; }
        logIdRef.current += 1;
        setVoiceLogs((prev) => [{ id: logIdRef.current, text: final, result: resultMsg, ok, time: new Date().toLocaleTimeString("id-ID") }, ...prev].slice(0, 5));
        setTranscript("");
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
  }, [toggleRelay, setAll, sensor, notify]);

  const toggleListen = () => {
    if (!voiceSupported) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); }
    else { setTranscript(""); recognitionRef.current?.start(); setListening(true); }
  };

  const tgConfigured = tgToken.length > 5 && tgChatId.length > 3;
  const relayOnCount = Object.values(relays).filter(Boolean).length;

  const relayIcons = ["💡", "🔌", "🌡️", "⚡"];
  const relayNames = ["Lampu Ruang", "Lampu Kamar", "AC/Kipas", "Listrik Luar"];

  return (
    <>
      <style>{globalStyles}</style>
      <div className="scanline" />
      <div className="grid-bg" />

      <div className="relative z-10 min-h-screen" style={{ fontFamily: "'Rajdhani', sans-serif" }}>

        {/* ── TOP STATUS BAR ── */}
        <div className="border-b border-[rgba(0,245,255,0.08)] bg-[rgba(2,5,16,0.9)] backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 h-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#2a3a5a] tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>SYS:</span>
              <span className={`text-[10px] font-bold tracking-wider ${connected ? "text-[#06ffa5]" : "text-[#ff006e]"}`} style={{ fontFamily: "'Orbitron', monospace" }}>
                {connected ? "ONLINE" : "OFFLINE"}
              </span>
              {connected && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#06ffa5]" style={{ boxShadow: "0 0 6px #06ffa5", animation: "neon-pulse 2s ease-in-out infinite" }} />
              )}
            </div>
            <div className="text-[10px] text-[#2a3a5a] tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>
              {time.toLocaleTimeString("id-ID")}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#2a3a5a]" style={{ fontFamily: "'Orbitron', monospace" }}>RELAY:</span>
              <span className={`text-[10px] font-bold ${relayOnCount > 0 ? "text-[#ffbe0b]" : "text-[#2a3a5a]"}`} style={{ fontFamily: "'Orbitron', monospace" }}>{relayOnCount}/4</span>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

          {/* ── HEADER ── */}
          <header className="py-4 relative">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] text-[#00f5ff] tracking-[0.4em] mb-2 opacity-70" style={{ fontFamily: "'Orbitron', monospace" }}>
                  ◈ IOT CONTROL SYSTEM v2.0
                </div>
                <h1 className="text-3xl font-black text-white title-glow leading-none tracking-tight" style={{ fontFamily: "'Orbitron', monospace" }}>
                  SMART<br />
                  <span className="text-[#00f5ff]">HOME</span>
                </h1>
                <p className="text-xs text-[#2a3a5a] mt-2 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>
                  ESP32 · DHT11 · MQTT · HiveMQ
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={() => setShowTgSetup(!showTgSetup)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold border tracking-widest transition-all rounded-sm ${
                    tgConfigured
                      ? "border-[#00f5ff]/40 bg-[#00f5ff]/10 text-[#00f5ff]"
                      : "border-[#1a2a3a] bg-[#050d1a] text-[#2a3a5a] hover:border-[#00f5ff]/20"
                  }`} style={{ fontFamily: "'Orbitron', monospace" }}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
                  </svg>
                  {tgConfigured ? "TG ✓" : "TELEGRAM"}
                </button>
                {/* Connection indicator */}
                <div className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold border tracking-widest rounded-sm ${
                  connected ? "border-[#06ffa5]/40 bg-[#06ffa5]/10 text-[#06ffa5]" : "border-[#ff006e]/40 bg-[#ff006e]/10 text-[#ff006e]"
                }`} style={{ fontFamily: "'Orbitron', monospace" }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#06ffa5]" : "bg-[#ff006e]"}`}
                    style={connected ? { animation: "neon-pulse 2s ease-in-out infinite", boxShadow: "0 0 6px #06ffa5" } : {}} />
                  {connected ? "ONLINE" : "OFFLINE"}
                </div>
              </div>
            </div>
            {/* Decorative line */}
            <div className="mt-4 h-px bg-gradient-to-r from-transparent via-[#00f5ff]/40 to-transparent" />
          </header>

          {/* ── TELEGRAM SETUP ── */}
          {showTgSetup && (
            <div className="relative border border-[#00f5ff]/20 bg-[#050d1a] rounded-sm p-5 corner-accent"
              style={{ boxShadow: "0 0 30px rgba(0,245,255,0.05), inset 0 0 30px rgba(0,245,255,0.02)" }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[9px] text-[#00f5ff]/50 tracking-[0.3em] mb-1" style={{ fontFamily: "'Orbitron', monospace" }}>◈ MODULE</div>
                  <h2 className="font-bold text-white tracking-widest text-sm" style={{ fontFamily: "'Orbitron', monospace" }}>TELEGRAM CONFIG</h2>
                </div>
                <button onClick={() => setShowTgSetup(false)}
                  className="w-7 h-7 border border-[#1a2a3a] text-[#2a3a5a] hover:text-white hover:border-[#ff006e]/40 transition-all flex items-center justify-center text-xs rounded-sm">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] text-[#00f5ff]/60 mb-2 tracking-[0.25em]" style={{ fontFamily: "'Orbitron', monospace" }}>BOT TOKEN</label>
                  <input type="password" value={tgToken} onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456789:ABCDefgh..."
                    className="w-full bg-[#020510] border border-[#1a2a3a] text-[#00f5ff] text-sm rounded-sm px-4 py-2.5 focus:outline-none focus:border-[#00f5ff]/40 placeholder:text-[#1a2a3a] tracking-wider"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }} />
                </div>
                <div>
                  <label className="block text-[9px] text-[#00f5ff]/60 mb-2 tracking-[0.25em]" style={{ fontFamily: "'Orbitron', monospace" }}>CHAT ID</label>
                  <input type="text" value={tgChatId} onChange={(e) => setTgChatId(e.target.value)}
                    placeholder="-100123456789"
                    className="w-full bg-[#020510] border border-[#1a2a3a] text-[#00f5ff] text-sm rounded-sm px-4 py-2.5 focus:outline-none focus:border-[#00f5ff]/40 placeholder:text-[#1a2a3a] tracking-wider"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }} />
                </div>
              </div>
              <p className="text-xs text-[#2a3a5a] leading-relaxed mt-4 mb-4">
                Buat bot via <span className="text-[#00f5ff]/60">@BotFather</span> → ambil token. Chat ID dari <span className="text-[#00f5ff]/60">@userinfobot</span>.
              </p>
              <button
                onClick={async () => {
                  const ok = await sendTelegram({ botToken: tgToken, chatId: tgChatId }, "✅ <b>IoT Smart Home</b>\nKoneksi Telegram berhasil!");
                  alert(ok ? "✓ Test notifikasi berhasil!" : "✗ Gagal — cek token & chat ID");
                }}
                className="w-full py-2.5 border border-[#00f5ff]/30 bg-[#00f5ff]/10 text-[#00f5ff] text-xs font-bold tracking-widest hover:bg-[#00f5ff]/20 transition-all rounded-sm"
                style={{ fontFamily: "'Orbitron', monospace" }}>
                ◈ TEST NOTIFICATION
              </button>
            </div>
          )}

          {/* ── SENSOR CARD ── */}
          <div className="relative border border-[#1a2a3a] bg-[#050d1a] rounded-sm p-5 corner-accent overflow-hidden"
            style={{ boxShadow: "0 0 40px rgba(0,245,255,0.04)" }}>
            {/* Vertical accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-[#00f5ff]/60 to-transparent" />

            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[9px] text-[#00f5ff]/50 tracking-[0.3em] mb-1" style={{ fontFamily: "'Orbitron', monospace" }}>◈ SENSOR</div>
                <h2 className="font-bold text-white tracking-widest text-sm" style={{ fontFamily: "'Orbitron', monospace" }}>DHT11 MONITOR</h2>
              </div>
              {sensor.updatedAt ? (
                <span className="text-[9px] text-[#00f5ff]/40 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>
                  UPD {sensor.updatedAt}
                </span>
              ) : (
                <span className="text-[9px] text-[#1a2a3a] tracking-widest animate-pulse" style={{ fontFamily: "'Orbitron', monospace" }}>AWAITING DATA...</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Temperature */}
              <div className={`relative border rounded-sm p-4 overflow-hidden transition-all ${
                sensor.temp !== null && sensor.temp >= 35
                  ? "border-[#ff006e]/40 bg-[#ff006e]/5 temp-critical"
                  : "border-[#1a2a3a] bg-[#020510]"
              }`}>
                <div className="absolute top-0 right-0 w-16 h-16 opacity-5"
                  style={{ background: `radial-gradient(circle, ${sensor.temp !== null && sensor.temp >= 35 ? "#ff006e" : "#ff9500"} 0%, transparent 70%)` }} />
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🌡️</span>
                  <span className="text-[9px] tracking-widest text-[#2a3a5a]" style={{ fontFamily: "'Orbitron', monospace" }}>SUHU</span>
                </div>
                <p className="text-4xl font-black leading-none" style={{
                  fontFamily: "'Orbitron', monospace",
                  color: sensor.temp !== null && sensor.temp >= 35 ? "#ff006e" : "#ffbe0b",
                  textShadow: `0 0 20px ${sensor.temp !== null && sensor.temp >= 35 ? "rgba(255,0,110,0.6)" : "rgba(255,190,11,0.5)"}`
                }}>
                  {sensor.temp !== null ? sensor.temp : "--"}
                </p>
                <span className="text-xs text-[#2a3a5a]" style={{ fontFamily: "'Orbitron', monospace" }}>°C</span>
                {sensor.temp !== null && sensor.temp >= 35 && (
                  <p className="text-[9px] text-[#ff006e] mt-2 tracking-widest font-bold" style={{ fontFamily: "'Orbitron', monospace", animation: "flicker 2s infinite" }}>
                    ⚠ KRITIS
                  </p>
                )}
              </div>

              {/* Humidity */}
              <div className="relative border border-[#1a2a3a] bg-[#020510] rounded-sm p-4 overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 opacity-5"
                  style={{ background: "radial-gradient(circle, #00f5ff 0%, transparent 70%)" }} />
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💧</span>
                  <span className="text-[9px] tracking-widest text-[#2a3a5a]" style={{ fontFamily: "'Orbitron', monospace" }}>LEMBAB</span>
                </div>
                <p className="text-4xl font-black leading-none text-[#00f5ff]" style={{
                  fontFamily: "'Orbitron', monospace",
                  textShadow: "0 0 20px rgba(0,245,255,0.5)"
                }}>
                  {sensor.hum !== null ? sensor.hum : "--"}
                </p>
                <span className="text-xs text-[#2a3a5a]" style={{ fontFamily: "'Orbitron', monospace" }}>%RH</span>
              </div>
            </div>

            {/* Mini data table */}
            <div className="mt-4 space-y-1">
              <DataLine label="STATUS" value={sensor.temp !== null ? (sensor.temp >= 35 ? "⚠ ABNORMAL" : "◉ NORMAL") : "— NO DATA"} />
              <DataLine label="BROKER" value="HiveMQ WebSocket" />
              <DataLine label="KONEKSI" value={connected ? "◉ ESTABLISHED" : "○ DISCONNECTED"} />
            </div>
          </div>

          {/* ── VOICE COMMAND ── */}
          <div className={`relative border rounded-sm p-5 overflow-hidden transition-all duration-500 ${
            listening
              ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/5 mic-active"
              : "border-[#1a2a3a] bg-[#050d1a]"
          }`}>
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-[#8b5cf6]/60 to-transparent" />

            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[9px] text-[#8b5cf6]/60 tracking-[0.3em] mb-1" style={{ fontFamily: "'Orbitron', monospace" }}>◈ INPUT</div>
                <h2 className="font-bold text-white tracking-widest text-sm" style={{ fontFamily: "'Orbitron', monospace" }}>VOICE CONTROL</h2>
                {!voiceSupported && (
                  <p className="text-[9px] text-[#ff006e] mt-1 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>SPEECH API NOT SUPPORTED</p>
                )}
              </div>

              {/* Mic button */}
              <button
                onClick={toggleListen}
                disabled={!voiceSupported || !connected}
                className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  !voiceSupported || !connected
                    ? "bg-[#0a0f1a] border border-[#1a2a3a] text-[#1a2a3a] cursor-not-allowed"
                    : listening
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-[#0a0f1a] border border-[#8b5cf6]/30 text-[#8b5cf6] hover:bg-[#8b5cf6]/20"
                }`}
                style={listening ? { boxShadow: "0 0 20px rgba(139,92,246,0.6), 0 0 50px rgba(139,92,246,0.3)" } : {}}>
                {listening && (
                  <>
                    <span className="absolute inset-0 rounded-full border border-[#8b5cf6]/60" style={{ animation: "pulse-ring 1.5s ease-out infinite" }} />
                    <span className="absolute inset-0 rounded-full border border-[#8b5cf6]/30" style={{ animation: "pulse-ring 1.5s ease-out 0.5s infinite" }} />
                  </>
                )}
                <svg className="w-6 h-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z"/>
                </svg>
              </button>
            </div>

            {/* Live transcript */}
            {listening && (
              <div className="mb-4 px-4 py-3 border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 rounded-sm min-h-[44px]">
                <p className="text-sm text-[#8b5cf6] tracking-wide italic">
                  {transcript || (
                    <span className="flex items-center gap-2">
                      <span style={{ animation: "neon-pulse 1s ease-in-out infinite" }}>●</span> Mendengarkan...
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Command groups */}
            <div className="space-y-3 mb-4">
              {[
                { label: "KONTROL", cmds: ["Nyalakan lampu", "Matikan lampu", "Nyalakan lampu satu", "Semua ON", "Semua OFF"] },
                { label: "SENSOR", cmds: ["Berapa temperatur", "Berapa kelembapan"] },
                { label: "VARIASI", cmds: ["Nyalakan variasi 1", "Nyalakan variasi 2", "Matikan variasi"] },
              ].map((group) => (
                <div key={group.label}>
                  <p className="text-[9px] text-[#8b5cf6]/40 tracking-[0.3em] mb-2" style={{ fontFamily: "'Orbitron', monospace" }}>{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.cmds.map((cmd) => (
                      <span key={cmd} className="text-[10px] px-2.5 py-1 border border-[#8b5cf6]/15 bg-[#8b5cf6]/5 text-[#8b5cf6]/60 rounded-sm tracking-wide">
                        "{cmd}"
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Voice logs */}
            {voiceLogs.length > 0 && (
              <div className="space-y-2 border-t border-[#1a2a3a] pt-4">
                <p className="text-[9px] text-[#2a3a5a] tracking-[0.3em]" style={{ fontFamily: "'Orbitron', monospace" }}>◈ LOG</p>
                {voiceLogs.map((log) => (
                  <div key={log.id} className={`flex items-start gap-3 px-3 py-2.5 border rounded-sm text-xs transition-all ${
                    log.ok ? "bg-[#06ffa5]/5 border-[#06ffa5]/15" : "bg-[#ff006e]/5 border-[#ff006e]/15"
                  }`} style={{ animation: "slide-in 0.2s ease-out" }}>
                    <span className={`text-sm font-bold ${log.ok ? "text-[#06ffa5]" : "text-[#ff006e]"}`}>{log.ok ? "◉" : "○"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate tracking-wide">"{log.text}"</p>
                      <p className={`mt-0.5 tracking-widest text-[10px] ${log.ok ? "text-[#06ffa5]" : "text-[#ff006e]"}`} style={{ fontFamily: "'Orbitron', monospace" }}>{log.result}</p>
                    </div>
                    <span className="text-[#2a3a5a] text-[9px] shrink-0" style={{ fontFamily: "'Orbitron', monospace" }}>{log.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RELAY GRID ── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-[9px] text-[#ffbe0b]/60 tracking-[0.3em]" style={{ fontFamily: "'Orbitron', monospace" }}>◈ RELAY CONTROL</div>
              <div className="flex-1 h-px bg-gradient-to-r from-[#ffbe0b]/20 to-transparent" />
            </div>
            {variasi > 0 && (
              <div className="mb-3 px-3 py-2 border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 rounded-sm">
                <p className="text-[10px] text-[#8b5cf6] tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>
                  ◈ VARIASI {variasi} AKTIF — RELAY TERKUNCI
                </p>
              </div>
            )}
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
                    className={`group relative rounded-sm p-4 text-left border transition-all duration-300 overflow-hidden ${
                      isOn
                        ? "border-[#ffbe0b]/40 bg-[#ffbe0b]/5 relay-on"
                        : "border-[#1a2a3a] bg-[#050d1a] relay-off"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>

                    {/* Corner accents */}
                    <span className={`absolute top-0 left-0 w-3 h-3 border-t border-l ${isOn ? "border-[#ffbe0b]/60" : "border-[#1a2a3a]"} transition-colors`} />
                    <span className={`absolute bottom-0 right-0 w-3 h-3 border-b border-r ${isOn ? "border-[#ffbe0b]/60" : "border-[#1a2a3a]"} transition-colors`} />

                    {/* Background glow */}
                    {isOn && (
                      <div className="absolute inset-0 opacity-10"
                        style={{ background: "radial-gradient(circle at 30% 30%, #ffbe0b 0%, transparent 70%)" }} />
                    )}

                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{relayIcons[id - 1]}</span>
                      {isPending ? (
                        <svg className="w-4 h-4 text-[#2a3a5a]" style={{ animation: "spin-slow 1s linear infinite" }} fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <span className={`w-2 h-2 rounded-full transition-all ${isOn ? "bg-[#ffbe0b]" : "bg-[#1a2a3a]"}`}
                          style={isOn ? { boxShadow: "0 0 8px #ffbe0b, 0 0 16px rgba(255,190,11,0.4)", animation: "neon-pulse 2s ease-in-out infinite" } : {}} />
                      )}
                    </div>

                    <p className="text-xs font-bold text-white tracking-wider mb-0.5" style={{ fontFamily: "'Orbitron', monospace" }}>
                      RELAY {id}
                    </p>
                    <p className="text-[10px] text-[#2a3a5a] tracking-wide mb-2">{relayNames[id - 1]}</p>
                    <p className={`text-[9px] font-bold tracking-widest ${
                      isPending ? "text-[#2a3a5a]" : isOn ? "text-[#ffbe0b]" : "text-[#1a2a3a]"
                    }`} style={{ fontFamily: "'Orbitron', monospace" }}>
                      {isPending ? "WAITING..." : isOn ? "◉ ACTIVE" : "○ STANDBY"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── GLOBAL CONTROLS ── */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setAll(true)}
              disabled={!connected || variasi > 0}
              className="relative py-3.5 border border-[#06ffa5]/30 bg-[#06ffa5]/5 text-[#06ffa5] text-xs font-bold tracking-widest hover:bg-[#06ffa5]/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-sm overflow-hidden"
              style={{ fontFamily: "'Orbitron', monospace" }}>
              <span className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#06ffa5]/40 to-transparent" />
              ◉ ALL ON
            </button>
            <button
              onClick={() => setAll(false)}
              disabled={!connected || variasi > 0}
              className="relative py-3.5 border border-[#ff006e]/30 bg-[#ff006e]/5 text-[#ff006e] text-xs font-bold tracking-widest hover:bg-[#ff006e]/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-sm overflow-hidden"
              style={{ fontFamily: "'Orbitron', monospace" }}>
              <span className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ff006e]/40 to-transparent" />
              ○ ALL OFF
            </button>
          </div>

          {/* ── VARIASI ── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-[9px] text-[#8b5cf6]/60 tracking-[0.3em]" style={{ fontFamily: "'Orbitron', monospace" }}>◈ LIGHT VARIATION</div>
              <div className="flex-1 h-px bg-gradient-to-r from-[#8b5cf6]/20 to-transparent" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { v: 1, label: "VAR 1", desc: "Sequence A" },
                { v: 2, label: "VAR 2", desc: "Sequence B" },
                { v: 0, label: "STOP", desc: "Halt All" },
              ].map(({ v, label, desc }) => (
                <button
                  key={v}
                  onClick={() => setVariasiCmd(v)}
                  disabled={!connected}
                  className={`py-3 px-2 border rounded-sm text-center transition-all disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden ${
                    variasi === v && v > 0
                      ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                      : v === 0
                      ? "border-[#ff006e]/20 bg-[#050d1a] hover:border-[#ff006e]/30"
                      : "border-[#1a2a3a] bg-[#050d1a] hover:border-[#8b5cf6]/20"
                  }`}>
                  {variasi === v && v > 0 && (
                    <span className="absolute inset-0 opacity-10"
                      style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />
                  )}
                  <p className={`text-xs font-black tracking-widest ${
                    variasi === v && v > 0 ? "text-[#8b5cf6]" : v === 0 ? "text-[#ff006e]/70" : "text-[#2a3a5a]"
                  }`} style={{ fontFamily: "'Orbitron', monospace" }}>{label}</p>
                  <p className="text-[9px] text-[#1a2a3a] mt-0.5" style={{ fontFamily: "'Orbitron', monospace" }}>{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="py-4 border-t border-[rgba(0,245,255,0.06)] text-center">
            <p className="text-[9px] text-[#1a2a3a] tracking-[0.3em]" style={{ fontFamily: "'Orbitron', monospace" }}>
              IoT SMART HOME © 2025 · ESP32 · MQTT · DHT11
            </p>
          </div>

        </div>
      </div>

      {/* ── TOAST ── */}
      {tgStatus !== "idle" && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 border text-[10px] font-bold tracking-widest shadow-lg transition-all rounded-sm z-50 ${
          tgStatus === "sending"
            ? "bg-[#050d1a] border-[#00f5ff]/20 text-[#00f5ff]"
            : tgStatus === "ok"
            ? "bg-[#050d1a] border-[#06ffa5]/30 text-[#06ffa5]"
            : "bg-[#050d1a] border-[#ff006e]/30 text-[#ff006e]"
        }`} style={{ fontFamily: "'Orbitron', monospace" }}>
          {tgStatus === "sending" && "◈ SENDING..."}
          {tgStatus === "ok" && "◉ DELIVERED"}
          {tgStatus === "fail" && "○ FAILED"}
        </div>
      )}
    </>
  );
}
