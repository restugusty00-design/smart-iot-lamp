/**
 * IoT Smart Home Dashboard — v3 Clean Layout
 * Aesthetic: Neon-Cyberpunk, well-structured grid
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface RelayState { 1: boolean; 2: boolean; 3: boolean; 4: boolean; }
interface SensorData { temp: number | null; hum: number | null; updatedAt: string | null; }
interface TelegramConfig { botToken: string; chatId: string; }
interface VoiceLog { id: number; text: string; result: string; ok: boolean; time: string; }
interface ParsedCommand {
  type: "relay" | "all" | "sensor_temp" | "sensor_hum" | "sensor" | "variasi" | "unknown";
  relayId?: number; state?: boolean; variasiId?: number;
}
type MqttClient = any;

function loadMqttScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).mqtt) return resolve();
    const s = document.createElement("script");
    s.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

async function sendTelegram(cfg: TelegramConfig, text: string): Promise<boolean> {
  if (!cfg.botToken || !cfg.chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
    });
    return res.ok;
  } catch { return false; }
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

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #030812;
  font-family: 'Rajdhani', sans-serif;
  overflow-x: hidden;
  min-height: 100vh;
}

.bg-grid {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(0,245,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,245,255,0.025) 1px, transparent 1px);
  background-size: 48px 48px;
}

.bg-scanline {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 3px,
    rgba(0,245,255,0.012) 3px, rgba(0,245,255,0.012) 4px
  );
}

/* Panel */
.panel {
  position: relative;
  background: #060e1c;
  border: 1px solid #0f1f35;
  border-radius: 4px;
  overflow: hidden;
}
.panel::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0,245,255,0.4), transparent);
}
.panel-accent-left {
  position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
  background: linear-gradient(to bottom, transparent, rgba(0,245,255,0.5), transparent);
}

/* Section label */
.sec-label {
  font-family: 'Orbitron', monospace;
  font-size: 9px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(0,245,255,0.4);
  display: flex; align-items: center; gap: 8px;
}
.sec-label::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(to right, rgba(0,245,255,0.15), transparent);
}

/* Section heading */
.sec-heading {
  font-family: 'Orbitron', monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #fff;
  text-transform: uppercase;
}

/* Mono label */
.mono { font-family: 'Orbitron', monospace; }

/* Sensor value */
.sensor-value {
  font-family: 'Orbitron', monospace;
  font-size: 36px;
  font-weight: 900;
  line-height: 1;
}

/* Relay card */
.relay-card {
  position: relative;
  background: #060e1c;
  border: 1px solid #0f1f35;
  border-radius: 4px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: left;
  overflow: hidden;
  width: 100%;
}
.relay-card:hover:not(:disabled) { border-color: rgba(255,190,11,0.2); }
.relay-card.on {
  border-color: rgba(255,190,11,0.35);
  background: linear-gradient(135deg, rgba(255,190,11,0.06), rgba(6,14,28,1));
  box-shadow: 0 0 20px rgba(255,190,11,0.08), inset 0 0 20px rgba(255,190,11,0.04);
}
.relay-card:disabled { opacity: 0.45; cursor: not-allowed; }

/* Toggle switch */
.toggle-track {
  width: 36px; height: 18px;
  border-radius: 9px;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-thumb {
  position: absolute; top: 3px;
  width: 12px; height: 12px; border-radius: 50%;
  transition: all 0.2s;
}

/* Mic button */
.mic-btn {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid;
  transition: all 0.2s;
  position: relative; flex-shrink: 0;
}

/* Variasi button */
.var-btn {
  padding: 10px 8px;
  border-radius: 4px;
  border: 1px solid #0f1f35;
  background: #060e1c;
  transition: all 0.2s;
  cursor: pointer;
  text-align: center;
}
.var-btn:hover:not(:disabled) { border-color: rgba(139,92,246,0.25); }
.var-btn.active {
  border-color: rgba(139,92,246,0.4);
  background: rgba(139,92,246,0.08);
  box-shadow: 0 0 12px rgba(139,92,246,0.12);
}
.var-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Animations */
@keyframes neon-pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes ping { 0%{transform:scale(1);opacity:.8} 70%{transform:scale(1.5);opacity:0} 100%{transform:scale(1);opacity:0} }
@keyframes slide-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes temp-warn { 0%,100%{box-shadow:0 0 8px rgba(255,0,110,0.3)} 50%{box-shadow:0 0 20px rgba(255,0,110,0.6)} }

.pulse { animation: neon-pulse 2s ease-in-out infinite; }
.spin  { animation: spin 1s linear infinite; }
.ping  { animation: ping 1.5s ease-out infinite; }
.slide-up { animation: slide-up 0.2s ease-out; }
.temp-warn { animation: temp-warn 1.5s ease-in-out infinite; }

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #030812; }
::-webkit-scrollbar-thumb { background: #0f1f35; border-radius: 2px; }
`;

// ── Reusable Panel ─────────────────────────────────────────────────────────────
const Panel = ({ children, className = "", accentColor = "cyan" }: { children: React.ReactNode; className?: string; accentColor?: string }) => {
  const colors: Record<string, string> = {
    cyan:   "rgba(0,245,255,0.5)",
    amber:  "rgba(255,190,11,0.5)",
    purple: "rgba(139,92,246,0.5)",
    green:  "rgba(6,255,165,0.5)",
  };
  return (
    <div className={`panel ${className}`}>
      <div className="panel-accent-left" style={{ background: `linear-gradient(to bottom, transparent, ${colors[accentColor]}, transparent)` }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${colors[accentColor]}, transparent)` }} />
      {children}
    </div>
  );
};

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [connected, setConnected] = useState(false);
  const [relays, setRelays] = useState<RelayState>({ 1: false, 2: false, 3: false, 4: false });
  const [pending, setPending] = useState<RelayState>({ 1: false, 2: false, 3: false, 4: false });
  const [sensor, setSensor] = useState<SensorData>({ temp: null, hum: null, updatedAt: null });
  const [variasi, setVariasi] = useState(0);
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [showTgSetup, setShowTgSetup] = useState(false);
  const [tgStatus, setTgStatus] = useState<"idle"|"sending"|"ok"|"fail">("idle");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [time, setTime] = useState(new Date());
  const recognitionRef = useRef<any>(null);
  const logIdRef = useRef(0);
  const mqttRef = useRef<MqttClient>(null);

  const TOPICS = {
    status: "iot/rumah/relay/status", command: "iot/rumah/relay/command",
    allCommand: "iot/rumah/relay/allcommand", sensor: "iot/rumah/sensor/data",
    variasiStatus: "iot/rumah/variasi/status", variasiCommand: "iot/rumah/variasi/command",
  };

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const notify = useCallback(async (msg: string) => {
    if (!tgToken || !tgChatId) return;
    setTgStatus("sending");
    const ok = await sendTelegram({ botToken: tgToken, chatId: tgChatId }, msg);
    setTgStatus(ok ? "ok" : "fail");
    setTimeout(() => setTgStatus("idle"), 2500);
  }, [tgToken, tgChatId]);

  useEffect(() => {
    let client: MqttClient;
    loadMqttScript().then(() => {
      const mqtt = (window as any).mqtt;
      client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", { clientId: "web_" + Math.random().toString(16).slice(2, 10), reconnectPeriod: 3000 });
      client.on("connect", () => { setConnected(true); client.subscribe([TOPICS.status, TOPICS.sensor, TOPICS.variasiStatus]); });
      client.on("close", () => setConnected(false));
      client.on("message", (topic: string, message: Buffer) => {
        try {
          const payload = JSON.parse(message.toString());
          if (topic === TOPICS.status) {
            setRelays((prev) => {
              const next = { ...prev };
              for (let i = 1; i <= 4; i++) { const k = `relay${i}` as keyof typeof payload; if (payload[k] !== undefined) (next as any)[i] = payload[k] === true || String(payload[k]) === "true"; }
              return next;
            });
            setPending({ 1: false, 2: false, 3: false, 4: false });
          } else if (topic === TOPICS.sensor) {
            setSensor({ temp: payload.suhu !== undefined ? parseFloat(payload.suhu) : null, hum: payload.kelembaban !== undefined ? parseFloat(payload.kelembaban) : null, updatedAt: new Date().toLocaleTimeString("id-ID") });
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
    recognition.lang = "id-ID"; recognition.continuous = false; recognition.interimResults = true;
    recognition.onresult = (e: any) => {
      const interim = Array.from(e.results as SpeechRecognitionResultList).map((r: any) => r[0].transcript).join(" ");
      setTranscript(interim);
      if (e.results[e.results.length - 1].isFinal) {
        const cmd = parseVoiceCommand(interim);
        let resultMsg = ""; let ok = false;
        if (cmd.type === "relay" && cmd.relayId !== undefined) { toggleRelay(cmd.relayId); resultMsg = `Lampu ${cmd.relayId} → ${cmd.state ? "ON" : "OFF"}`; ok = true; notify(`🎤 <b>Perintah Suara</b>\nLampu ${cmd.relayId} → ${cmd.state ? "MENYALA" : "MATI"}\nTeks: "${interim}"`); }
        else if (cmd.type === "all") { setAll(cmd.state!); resultMsg = `Semua → ${cmd.state ? "ON" : "OFF"}`; ok = true; notify(`🎤 <b>Perintah Suara</b>\nSemua → ${cmd.state ? "MENYALA" : "MATI"}\nTeks: "${interim}"`); }
        else if (cmd.type === "sensor_temp") { resultMsg = `Suhu: ${sensor.temp !== null ? sensor.temp + "°C" : "N/A"}`; ok = true; }
        else if (cmd.type === "sensor_hum") { resultMsg = `Lembab: ${sensor.hum !== null ? sensor.hum + "%" : "N/A"}`; ok = true; }
        else if (cmd.type === "sensor") { resultMsg = `${sensor.temp ?? "--"}°C | ${sensor.hum ?? "--"}%`; ok = true; }
        else if (cmd.type === "variasi") { setVariasiCmd(cmd.variasiId!); resultMsg = cmd.variasiId === 0 ? "Variasi stop" : `Variasi ${cmd.variasiId} aktif`; ok = true; notify(`🎤 <b>Perintah Suara</b>\n${cmd.variasiId === 0 ? "Variasi dimatikan" : "Variasi " + cmd.variasiId + " aktif"}\nTeks: "${interim}"`); }
        else { resultMsg = "Perintah tidak dikenal"; ok = false; }
        logIdRef.current += 1;
        setVoiceLogs((prev) => [{ id: logIdRef.current, text: interim, result: resultMsg, ok, time: new Date().toLocaleTimeString("id-ID") }, ...prev].slice(0, 5));
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

  const relayMeta = [
    { id: 1 as const, icon: "💡", name: "Lampu Ruang" },
    { id: 2 as const, icon: "🔌", name: "Lampu Kamar" },
    { id: 3 as const, icon: "❄️",  name: "AC / Kipas" },
    { id: 4 as const, icon: "⚡", name: "Listrik Luar" },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="bg-grid" />
      <div className="bg-scanline" />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>

        {/* ══ TOP BAR ══ */}
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(3,8,18,0.95)", backdropFilter: "blur(8px)",
          borderBottom: "1px solid #0f1f35",
        }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px", height: 44, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left: sys + status */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ fontSize: 9, color: "#1a3a5a", letterSpacing: "0.25em" }}>SYS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className={connected ? "pulse" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#06ffa5" : "#ff006e", boxShadow: connected ? "0 0 6px #06ffa5" : "none" }} />
                <span className="mono" style={{ fontSize: 9, letterSpacing: "0.2em", color: connected ? "#06ffa5" : "#ff006e" }}>
                  {connected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>
            {/* Center: clock */}
            <span className="mono" style={{ fontSize: 11, color: "#1a3a5a", letterSpacing: "0.2em" }}>
              {time.toLocaleTimeString("id-ID")}
            </span>
            {/* Right: relay count */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="mono" style={{ fontSize: 9, color: "#1a3a5a", letterSpacing: "0.2em" }}>RELAY</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: relayOnCount > 0 ? "#ffbe0b" : "#1a3a5a" }}>
                {relayOnCount}/4
              </span>
            </div>
          </div>
        </div>

        {/* ══ MAIN CONTENT ══ */}
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── HEADER ── */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1px solid #0a1828" }}>
            <div>
              <div className="mono" style={{ fontSize: 9, color: "rgba(0,245,255,0.5)", letterSpacing: "0.35em", marginBottom: 6 }}>
                ◈ IOT CONTROL SYSTEM v2.0
              </div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, color: "#fff", textShadow: "0 0 30px rgba(0,245,255,0.3)" }}>
                SMART <span style={{ color: "#00f5ff" }}>HOME</span>
              </div>
              <div className="mono" style={{ fontSize: 9, color: "#1a3a5a", letterSpacing: "0.25em", marginTop: 4 }}>
                ESP32 · DHT11 · MQTT · HiveMQ
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <button
                onClick={() => setShowTgSetup(!showTgSetup)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 3, cursor: "pointer",
                  fontFamily: "'Orbitron', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                  border: tgConfigured ? "1px solid rgba(0,245,255,0.3)" : "1px solid #0f1f35",
                  background: tgConfigured ? "rgba(0,245,255,0.08)" : "#060e1c",
                  color: tgConfigured ? "#00f5ff" : "#1a3a5a",
                  transition: "all 0.2s",
                }}>
                <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
                </svg>
                TELEGRAM {tgConfigured ? "✓" : ""}
              </button>
            </div>
          </div>

          {/* ── TELEGRAM SETUP ── */}
          {showTgSetup && (
            <Panel accentColor="cyan">
              <div style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div className="sec-label" style={{ marginBottom: 3 }}>◈ KONFIGURASI</div>
                    <div className="sec-heading">Telegram Bot</div>
                  </div>
                  <button onClick={() => setShowTgSetup(false)} style={{ background: "none", border: "1px solid #0f1f35", color: "#1a3a5a", width: 28, height: 28, borderRadius: 3, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                  {[
                    { label: "BOT TOKEN", value: tgToken, setter: setTgToken, type: "password", ph: "123456789:ABCDefgh..." },
                    { label: "CHAT ID", value: tgChatId, setter: setTgChatId, type: "text", ph: "-100123456789" },
                  ].map((f) => (
                    <div key={f.label}>
                      <div className="mono" style={{ fontSize: 9, color: "rgba(0,245,255,0.4)", letterSpacing: "0.25em", marginBottom: 5 }}>{f.label}</div>
                      <input
                        type={f.type} value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.ph}
                        style={{ width: "100%", background: "#030812", border: "1px solid #0f1f35", color: "#00f5ff", fontSize: 13, borderRadius: 3, padding: "8px 12px", outline: "none", fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}
                        onFocus={(e) => (e.target.style.borderColor = "rgba(0,245,255,0.35)")}
                        onBlur={(e) => (e.target.style.borderColor = "#0f1f35")}
                      />
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: "#1a3a5a", lineHeight: 1.6, marginBottom: 12 }}>
                  Buat bot via <span style={{ color: "rgba(0,245,255,0.5)" }}>@BotFather</span>, ambil token. Chat ID dari <span style={{ color: "rgba(0,245,255,0.5)" }}>@userinfobot</span>.
                </p>
                <button
                  onClick={async () => { const ok = await sendTelegram({ botToken: tgToken, chatId: tgChatId }, "✅ <b>IoT Smart Home</b>\nKoneksi Telegram berhasil!"); alert(ok ? "✓ Test berhasil!" : "✗ Gagal — cek token & chat ID"); }}
                  style={{ width: "100%", padding: "9px", border: "1px solid rgba(0,245,255,0.25)", background: "rgba(0,245,255,0.07)", color: "#00f5ff", borderRadius: 3, cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", transition: "all 0.2s" }}
                  onMouseOver={(e) => ((e.target as any).style.background = "rgba(0,245,255,0.12)")}
                  onMouseOut={(e) => ((e.target as any).style.background = "rgba(0,245,255,0.07)")}>
                  ◈ TEST NOTIFIKASI
                </button>
              </div>
            </Panel>
          )}

          {/* ── SENSOR + VOICE (side by side on wider screens, stacked on narrow) ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* SENSOR */}
            <Panel accentColor="cyan" style={{ gridColumn: "span 2" } as any}>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div className="sec-label" style={{ marginBottom: 3 }}>◈ SENSOR MODULE</div>
                    <div className="sec-heading">DHT11 Monitor</div>
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: sensor.updatedAt ? "rgba(0,245,255,0.4)" : "#1a3a5a", letterSpacing: "0.15em" }}>
                    {sensor.updatedAt ? `UPD ${sensor.updatedAt}` : "AWAITING DATA"}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {/* Temp */}
                  <div style={{
                    background: "#030812", borderRadius: 4, padding: "12px 14px",
                    border: sensor.temp !== null && sensor.temp >= 35 ? "1px solid rgba(255,0,110,0.35)" : "1px solid #0a1828",
                  }} className={sensor.temp !== null && sensor.temp >= 35 ? "temp-warn" : ""}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>🌡️</span>
                      <span className="mono" style={{ fontSize: 9, letterSpacing: "0.2em", color: "#1a3a5a" }}>SUHU</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span className="sensor-value" style={{ color: sensor.temp !== null && sensor.temp >= 35 ? "#ff006e" : "#ffbe0b", textShadow: `0 0 20px ${sensor.temp !== null && sensor.temp >= 35 ? "rgba(255,0,110,0.5)" : "rgba(255,190,11,0.4)"}` }}>
                        {sensor.temp !== null ? sensor.temp : "--"}
                      </span>
                      <span className="mono" style={{ fontSize: 12, color: "#1a3a5a" }}>°C</span>
                    </div>
                    {sensor.temp !== null && sensor.temp >= 35 && (
                      <div className="mono" style={{ fontSize: 9, color: "#ff006e", letterSpacing: "0.2em", marginTop: 5 }}>⚠ SUHU KRITIS</div>
                    )}
                  </div>

                  {/* Humidity */}
                  <div style={{ background: "#030812", borderRadius: 4, padding: "12px 14px", border: "1px solid #0a1828" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>💧</span>
                      <span className="mono" style={{ fontSize: 9, letterSpacing: "0.2em", color: "#1a3a5a" }}>KELEMBABAN</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span className="sensor-value" style={{ color: "#00f5ff", textShadow: "0 0 20px rgba(0,245,255,0.4)" }}>
                        {sensor.hum !== null ? sensor.hum : "--"}
                      </span>
                      <span className="mono" style={{ fontSize: 12, color: "#1a3a5a" }}>%RH</span>
                    </div>
                  </div>
                </div>

                {/* Status row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 10 }}>
                  {[
                    { label: "STATUS", value: sensor.temp !== null ? (sensor.temp >= 35 ? "⚠ ABNORMAL" : "◉ NORMAL") : "— NO DATA", color: sensor.temp !== null ? (sensor.temp >= 35 ? "#ff006e" : "#06ffa5") : "#1a3a5a" },
                    { label: "BROKER", value: "HiveMQ WS", color: "#1a3a5a" },
                    { label: "MQTT", value: connected ? "◉ CONNECTED" : "○ DISCONNECTED", color: connected ? "#06ffa5" : "#ff006e" },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "#030812", borderRadius: 3, padding: "7px 10px", border: "1px solid #0a1828" }}>
                      <div className="mono" style={{ fontSize: 8, letterSpacing: "0.2em", color: "#1a3a5a", marginBottom: 3 }}>{item.label}</div>
                      <div className="mono" style={{ fontSize: 9, color: item.color, letterSpacing: "0.1em" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

          </div>

          {/* ── RELAY GRID ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div className="sec-label" style={{ color: "rgba(255,190,11,0.5)" }}>◈ RELAY CONTROL</div>
            </div>

            {variasi > 0 && (
              <div style={{ marginBottom: 10, padding: "8px 12px", border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.07)", borderRadius: 3 }}>
                <span className="mono" style={{ fontSize: 9, color: "#8b5cf6", letterSpacing: "0.2em" }}>
                  ◈ VARIASI {variasi} AKTIF — RELAY TERKUNCI
                </span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {relayMeta.map(({ id, icon, name }) => {
                const isOn = relays[id];
                const isPending = pending[id];
                const disabled = !connected || isPending || variasi > 0;
                return (
                  <button key={id} onClick={() => toggleRelay(id)} disabled={disabled}
                    className={`relay-card ${isOn ? "on" : ""}`}>
                    {/* Top corner */}
                    <span style={{ position: "absolute", top: 0, left: 0, width: 10, height: 10, borderTop: `1px solid ${isOn ? "rgba(255,190,11,0.5)" : "#0f1f35"}`, borderLeft: `1px solid ${isOn ? "rgba(255,190,11,0.5)" : "#0f1f35"}` }} />
                    <span style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderBottom: `1px solid ${isOn ? "rgba(255,190,11,0.5)" : "#0f1f35"}`, borderRight: `1px solid ${isOn ? "rgba(255,190,11,0.5)" : "#0f1f35"}` }} />

                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      {/* Status indicator */}
                      {isPending ? (
                        <svg className="spin" style={{ width: 14, height: 14, color: "#1a3a5a" }} fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                          <path fill="currentColor" fillOpacity="0.75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <div style={{ position: "relative", width: 8, height: 8 }}>
                          {isOn && <span className="ping" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(255,190,11,0.4)" }} />}
                          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: isOn ? "#ffbe0b" : "#0f1f35", boxShadow: isOn ? "0 0 8px #ffbe0b" : "none" }} />
                        </div>
                      )}
                    </div>

                    {/* Toggle + label row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: "0.1em", marginBottom: 2 }}>RELAY {id}</div>
                        <div style={{ fontSize: 11, color: "#1a3a5a" }}>{name}</div>
                      </div>
                      {/* Toggle switch */}
                      <div className="toggle-track" style={{ background: isOn ? "rgba(255,190,11,0.25)" : "#0a1828", border: `1px solid ${isOn ? "rgba(255,190,11,0.4)" : "#0f1f35"}` }}>
                        <div className="toggle-thumb" style={{ background: isOn ? "#ffbe0b" : "#1a3a5a", left: isOn ? "calc(100% - 15px)" : "3px", boxShadow: isOn ? "0 0 6px #ffbe0b" : "none" }} />
                      </div>
                    </div>

                    <div className="mono" style={{ fontSize: 9, letterSpacing: "0.15em", marginTop: 6, color: isPending ? "#1a3a5a" : isOn ? "#ffbe0b" : "#0f1f35" }}>
                      {isPending ? "WAITING..." : isOn ? "◉ ACTIVE" : "○ STANDBY"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* All on/off */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              {[
                { label: "◉ ALL ON", color: "#06ffa5", bg: "rgba(6,255,165,0.07)", border: "rgba(6,255,165,0.25)", fn: () => setAll(true) },
                { label: "○ ALL OFF", color: "#ff006e", bg: "rgba(255,0,110,0.07)", border: "rgba(255,0,110,0.25)", fn: () => setAll(false) },
              ].map((btn) => (
                <button key={btn.label} onClick={btn.fn} disabled={!connected || variasi > 0}
                  style={{ padding: "10px", border: `1px solid ${btn.border}`, background: btn.bg, color: btn.color, borderRadius: 3, cursor: "pointer", fontFamily: "'Orbitron', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", transition: "all 0.2s", opacity: (!connected || variasi > 0) ? 0.3 : 1 }}
                  onMouseOver={(e) => { if (connected && variasi === 0) (e.target as any).style.opacity = "0.8"; }}
                  onMouseOut={(e) => { (e.target as any).style.opacity = (!connected || variasi > 0) ? "0.3" : "1"; }}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── VOICE + VARIASI (side by side) ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12, alignItems: "start" }}>

            {/* VOICE */}
            <Panel accentColor="purple">
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div className="sec-label" style={{ color: "rgba(139,92,246,0.5)", marginBottom: 3 }}>◈ INPUT MODULE</div>
                    <div className="sec-heading">Voice Control</div>
                    {!voiceSupported && (
                      <div className="mono" style={{ fontSize: 9, color: "#ff006e", letterSpacing: "0.15em", marginTop: 3 }}>NOT SUPPORTED</div>
                    )}
                  </div>
                  {/* Mic button */}
                  <button
                    onClick={toggleListen}
                    disabled={!voiceSupported || !connected}
                    className="mic-btn"
                    style={{
                      borderColor: (!voiceSupported || !connected) ? "#0f1f35" : listening ? "#8b5cf6" : "rgba(139,92,246,0.3)",
                      background: listening ? "rgba(139,92,246,0.2)" : "#030812",
                      color: (!voiceSupported || !connected) ? "#0f1f35" : listening ? "#8b5cf6" : "rgba(139,92,246,0.6)",
                      boxShadow: listening ? "0 0 20px rgba(139,92,246,0.4)" : "none",
                      cursor: (!voiceSupported || !connected) ? "not-allowed" : "pointer",
                    }}>
                    {listening && (
                      <>
                        <span className="ping" style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "1px solid rgba(139,92,246,0.4)" }} />
                        <span className="ping" style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "1px solid rgba(139,92,246,0.2)", animationDelay: "0.4s" }} />
                      </>
                    )}
                    <svg style={{ width: 18, height: 18, position: "relative", zIndex: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z"/>
                    </svg>
                  </button>
                </div>

                {/* Live transcript */}
                {listening && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", border: "1px solid rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.05)", borderRadius: 3, minHeight: 38 }}>
                    <span style={{ fontSize: 12, color: "#8b5cf6", fontStyle: "italic" }}>
                      {transcript || "Mendengarkan..."}
                    </span>
                  </div>
                )}

                {/* Command chips */}
                {[
                  { label: "KONTROL", color: "rgba(139,92,246,0.35)", cmds: ["Nyalakan lampu", "Matikan lampu", "Nyalakan lampu satu", "Semua ON"] },
                  { label: "SENSOR", color: "rgba(139,92,246,0.35)", cmds: ["Berapa temperatur", "Berapa kelembapan"] },
                  { label: "VARIASI", color: "rgba(139,92,246,0.35)", cmds: ["Variasi 1", "Variasi 2", "Matikan variasi"] },
                ].map((group) => (
                  <div key={group.label} style={{ marginBottom: 8 }}>
                    <div className="mono" style={{ fontSize: 8, color: "rgba(139,92,246,0.35)", letterSpacing: "0.25em", marginBottom: 4 }}>{group.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {group.cmds.map((cmd) => (
                        <span key={cmd} style={{ fontSize: 10, padding: "2px 8px", border: "1px solid rgba(139,92,246,0.15)", background: "rgba(139,92,246,0.04)", color: "rgba(139,92,246,0.55)", borderRadius: 2 }}>
                          "{cmd}"
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Logs */}
                {voiceLogs.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid #0a1828", paddingTop: 10 }}>
                    <div className="mono" style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: "0.25em", marginBottom: 6 }}>◈ LOG</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {voiceLogs.map((log) => (
                        <div key={log.id} className="slide-up" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px", border: `1px solid ${log.ok ? "rgba(6,255,165,0.12)" : "rgba(255,0,110,0.12)"}`, background: log.ok ? "rgba(6,255,165,0.04)" : "rgba(255,0,110,0.04)", borderRadius: 3 }}>
                          <span style={{ fontSize: 10, color: log.ok ? "#06ffa5" : "#ff006e", marginTop: 1 }}>{log.ok ? "◉" : "○"}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{log.text}"</div>
                            <div className="mono" style={{ fontSize: 9, color: log.ok ? "#06ffa5" : "#ff006e", letterSpacing: "0.1em", marginTop: 2 }}>{log.result}</div>
                          </div>
                          <span className="mono" style={{ fontSize: 8, color: "#1a3a5a", flexShrink: 0 }}>{log.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            {/* VARIASI */}
            <Panel accentColor="purple">
              <div style={{ padding: "14px 16px" }}>
                <div className="sec-label" style={{ color: "rgba(139,92,246,0.5)", marginBottom: 3 }}>◈ MODE</div>
                <div className="sec-heading" style={{ marginBottom: 14 }}>Light Variation</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { v: 1, icon: "▶", label: "Variasi 1", desc: "Sequence A" },
                    { v: 2, icon: "▶", label: "Variasi 2", desc: "Sequence B" },
                    { v: 0, icon: "⏹", label: "Stop", desc: "Halt All" },
                  ].map(({ v, icon, label, desc }) => (
                    <button key={v} onClick={() => setVariasiCmd(v)} disabled={!connected}
                      className={`var-btn ${variasi === v && v > 0 ? "active" : ""}`}
                      style={{ opacity: !connected ? 0.35 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, color: variasi === v && v > 0 ? "#8b5cf6" : v === 0 ? "rgba(255,0,110,0.5)" : "#1a3a5a" }}>{icon}</span>
                        <div style={{ textAlign: "left" }}>
                          <div className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: variasi === v && v > 0 ? "#8b5cf6" : v === 0 ? "rgba(255,0,110,0.6)" : "#2a3a5a" }}>{label.toUpperCase()}</div>
                          <div style={{ fontSize: 10, color: "#1a3a5a", marginTop: 1 }}>{desc}</div>
                        </div>
                        {variasi === v && v > 0 && (
                          <span className="pulse mono" style={{ marginLeft: "auto", fontSize: 8, color: "#8b5cf6", letterSpacing: "0.1em" }}>AKTIF</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Active status */}
                <div style={{ marginTop: 14, padding: "8px 10px", background: "#030812", borderRadius: 3, border: "1px solid #0a1828" }}>
                  <div className="mono" style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: "0.2em", marginBottom: 3 }}>STATUS</div>
                  <div className="mono" style={{ fontSize: 9, color: variasi > 0 ? "#8b5cf6" : "#1a3a5a", letterSpacing: "0.1em" }}>
                    {variasi > 0 ? `◉ VARIASI ${variasi} RUNNING` : "○ STOPPED"}
                  </div>
                </div>
              </div>
            </Panel>

          </div>

          {/* ── FOOTER ── */}
          <div style={{ borderTop: "1px solid #0a1828", paddingTop: 14, textAlign: "center" }}>
            <span className="mono" style={{ fontSize: 8, color: "#0a1828", letterSpacing: "0.3em" }}>
              IoT SMART HOME · ESP32 · MQTT · DHT11 · 2025
            </span>
          </div>

        </div>
      </div>

      {/* ── TOAST ── */}
      {tgStatus !== "idle" && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          padding: "10px 16px", borderRadius: 3,
          fontFamily: "'Orbitron', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
          border: tgStatus === "sending" ? "1px solid rgba(0,245,255,0.2)" : tgStatus === "ok" ? "1px solid rgba(6,255,165,0.3)" : "1px solid rgba(255,0,110,0.3)",
          background: "#060e1c",
          color: tgStatus === "sending" ? "#00f5ff" : tgStatus === "ok" ? "#06ffa5" : "#ff006e",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}>
          {tgStatus === "sending" && "◈ SENDING..."}
          {tgStatus === "ok" && "◉ DELIVERED"}
          {tgStatus === "fail" && "○ SEND FAILED"}
        </div>
      )}
    </>
  );
}
