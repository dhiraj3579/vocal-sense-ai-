/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Activity, 
  Volume2, 
  AudioLines, 
  History, 
  Info,
  Loader2,
  Trash2,
  Share2,
  Clock,
  Play,
  Pause,
  Download,
  FileAudio,
  MessageSquare,
  Upload,
  Sliders,
  ShieldAlert,
  Zap,
  Wind,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Brush
} from 'recharts';
import { AudioProcessor, AudioFeatures } from './services/audioProcessor';
import { classifyEmotion, EmotionResult } from './services/geminiService';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [features, setFeatures] = useState<Partial<AudioFeatures>>({});
  const [mfccData, setMfccData] = useState<{ name: string; value: number }[]>([]);
  const [rmsHistory, setRmsHistory] = useState<any[]>([]);
  const [spectralHistory, setSpectralHistory] = useState<any[]>([]);
  const [result, setResult] = useState<EmotionResult | null>(null);
  const [history, setHistory] = useState<(EmotionResult & { timestamp: number })[]>([]);
  const [timer, setTimer] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sessionTimeline, setSessionTimeline] = useState<{ time: string; confidence: number; emotion: string }[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Init real-time processor
      audioProcessorRef.current = new AudioProcessor();
      await audioProcessorRef.current.init(stream);
      audioProcessorRef.current.start((f) => {
        setFeatures(f);
        if (f.mfcc) {
          setMfccData(f.mfcc.map((v, i) => ({ name: `C${i}`, value: v })));
          setSpectralHistory(prev => [...prev.slice(-99), { clock: Date.now(), c0: f.mfcc[0], c1: f.mfcc[1], c2: f.mfcc[2] }]);
        }
        if (f.rms !== undefined) {
          setRmsHistory(prev => [...prev.slice(-99), { clock: Date.now(), val: f.rms }]);
        }
      });

      // Init MediaRecorder for Gemini analysis
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          if (isRecording) {
            const currentBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            if (currentBlob.size > 50000) {
               handleAnalysis(currentBlob, true);
            }
          }
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        await handleAnalysis(audioBlob, false);
      };

      mediaRecorder.start(4000);
      setIsRecording(true);
      setResult(null);
      setAudioUrl(null);
      setSessionTimeline([]);
      setRmsHistory([]);
      setSpectralHistory([]);
      setTimer(0);
      timerIntervalRef.current = window.setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Microphone access denied or error occurred.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      mediaRecorderRef.current.stop();
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stop();
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const handleAnalysis = async (blob: Blob, isStreaming: boolean) => {
    if (isStreaming && isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const res = await classifyEmotion(base64Audio, blob.type || 'audio/webm');
        setResult(res);
        setSessionTimeline(prev => [...prev.slice(-20), { 
          time: formatTime(timer), 
          confidence: res.confidence * 100,
          emotion: res.emotion
        }]);
        if (!isStreaming) {
          setHistory(prev => [{ ...res, timestamp: Date.now() }, ...prev].slice(0, 10));
        }
      };
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setAudioUrl(null);
    setSessionTimeline([]);
    
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    await handleAnalysis(file, false);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      audioPlayerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const downloadSample = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `voice_sample_${Date.now()}.webm`;
    a.click();
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getEmotionColor = (emotion?: string) => {
    switch (emotion) {
      case 'angry': return 'var(--danger)';
      case 'happy': return 'var(--happy)';
      case 'calm': return 'var(--calm)';
      case 'sad': return '#56CCF2';
      case 'surprised': return '#A29BFE';
      case 'neutral': return 'var(--text-muted)';
      default: return 'var(--text)';
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <audio 
        ref={audioPlayerRef} 
        src={audioUrl || undefined} 
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
      {/* Header */}
      <header className="h-[60px] px-10 flex items-center justify-between header-border">
        <div className="logo-text uppercase">VOCALSENSE_BIO_v3.0</div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="status-dot"></div>
            <span className="status-label">
              ENGINE: {isRecording ? 'CAPTURING' : isAnalyzing ? 'PROCESSING' : 'READY'} [STFT_MULTISCALE]
            </span>
          </div>
          <div className="timer-display opacity-80 border-l border-white/5 pl-4 ml-4 hidden md:block">
            {new Date().toLocaleDateString()} // {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] main-layout-bg gap-[1px]">
        {/* Analysis View (Main Content) */}
        <section className="bg-[var(--bg)] p-10 flex flex-col gap-10 overflow-auto">
          <div>
            <h2 className="section-title">Temporal Analysis // Signal Magnitude</h2>
            <div className="h-[200px] bg-[#151619] border border-dashed border-[#333] rounded flex items-center justify-center relative overflow-hidden group p-4">
              {rmsHistory.length > 0 ? (
                <div className="absolute inset-0 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rmsHistory}>
                      <defs>
                        <linearGradient id="colorRms" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="clock" hide />
                      <YAxis domain={[0, 0.5]} hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }}
                        itemStyle={{ color: 'var(--accent)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="val" 
                        stroke="var(--accent)" 
                        fillOpacity={1} 
                        fill="url(#colorRms)" 
                        animationDuration={0}
                        name="RMS Energy"
                      />
                      <Brush 
                        dataKey="clock" 
                        height={20} 
                        stroke="rgba(255,255,255,0.1)" 
                        fill="rgba(0,0,0,0.5)"
                        tickFormatter={() => ""}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                  <AudioLines size={120} />
                </div>
              )}
              
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none"></div>

              {!isRecording && !isAnalyzing && (
                <div className="z-20 flex gap-4">
                  <div className="bg-[var(--bg)] p-4 border border-[var(--accent)]/30 shadow-2xl">
                    <button 
                      onClick={startRecording}
                      className="px-8 py-3 bg-[var(--accent)] text-black font-mono text-xs font-bold tracking-[0.2em] hover:bg-white transition-all uppercase"
                    >
                      START_CAPTURE.exe
                    </button>
                  </div>
                  <div className="bg-[var(--bg)] p-4 border border-white/10 shadow-2xl">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept="audio/*" 
                      className="hidden" 
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-8 py-3 border border-white/20 text-white font-mono text-xs font-bold tracking-[0.2em] hover:bg-white hover:text-black transition-all uppercase flex items-center gap-2"
                    >
                      <Upload size={14} />
                      UPLOAD_SAMPLE.io
                    </button>
                  </div>
                </div>
              )}
              {isRecording && (
                <div className="z-20 bg-[var(--bg)] p-4 border border-[var(--danger)]/30 shadow-2xl">
                  <button 
                    onClick={stopRecording}
                    className="px-8 py-3 bg-[var(--danger)] text-white font-mono text-xs font-bold tracking-[0.2em] hover:bg-white hover:text-black transition-all uppercase"
                  >
                    TERMINATE_SESSION.kill
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="section-title">Spectral Density // MFCC Coefficients</h2>
            <div className="h-[180px] w-full bg-[#151619] border border-white/5 rounded-sm p-4 relative flex items-center justify-center">
               {spectralHistory.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={spectralHistory}>
                      <defs>
                        <linearGradient id="colorMFCC" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#A29BFE" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#A29BFE" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="clock" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0B0C10', border: '1px solid #333', fontSize: '10px' }}
                        labelFormatter={() => 'Spectral Vector'}
                      />
                      <Area type="monotone" dataKey="c0" stroke="#A29BFE" fillOpacity={1} fill="url(#colorMFCC)" animationDuration={0} name="MFCC 0" />
                      <Area type="monotone" dataKey="c1" stroke="var(--calm)" fill="transparent" animationDuration={0} name="MFCC 1" />
                      <Area type="monotone" dataKey="c2" stroke="var(--happy)" fill="transparent" animationDuration={0} name="MFCC 2" />
                      <Brush 
                        dataKey="clock" 
                        height={20} 
                        stroke="rgba(255,255,255,0.1)" 
                        fill="rgba(0,0,0,0.5)"
                        tickFormatter={() => ""}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
               ) : (
                 <div className="flex flex-col items-center gap-2 opacity-30 animate-pulse">
                   <Activity size={24} className="text-[var(--accent)]" />
                   <span className="status-label text-[10px]">Awaiting Signal Input...</span>
                 </div>
               )}
            </div>
          </div>

          {/* Emotion Trend Timeline */}
          {sessionTimeline.length > 0 && (
            <div>
              <h2 className="section-title">Session Flow // Emotion Timeline</h2>
              <div className="h-[120px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sessionTimeline}>
                    <defs>
                      <linearGradient id="colorConf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#444', fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0B0C10', border: '1px solid #333', fontSize: '10px' }}
                      itemStyle={{ color: 'var(--accent)' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="confidence" 
                      stroke="var(--accent)" 
                      fillOpacity={1} 
                      fill="url(#colorConf)" 
                      strokeWidth={1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* History Snippet as Tags */}
          {history.length > 0 && (
            <div className="mt-auto border-t border-white/5 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Cache Operations // History</h2>
                <Clock size={12} className="text-[var(--text-muted)]" />
              </div>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 5).map((item, i) => (
                  <div key={i} className="tag flex items-center gap-2 group cursor-help">
                    <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: getEmotionColor(item.emotion) }} />
                    <span className="text-[var(--text-muted)] group-hover:text-white transition-colors">
                      {item.emotion.toUpperCase()}
                    </span>
                    <span className="border-l border-white/10 pl-2 opacity-50">{(item.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="sidebar-container bg-[var(--surface)]">
          <div>
            <h2 className="section-title">Emotion Classifier</h2>
            <AnimatePresence mode="wait">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center opacity-50">
                  <Loader2 className="animate-spin text-[var(--accent)]" size={32} />
                  <span className="status-label">Classifying...</span>
                </div>
              ) : result ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col gap-4 relative"
                >
                  {isRecording && (
                    <div className="absolute -top-3 right-0 flex items-center gap-1.5 px-2 py-0.5 border border-[var(--accent)] bg-[var(--surface)] z-10 rounded animate-pulse">
                       <div className="w-1 h-1 bg-[var(--accent)] rounded-full" />
                       <span className="text-[8px] font-mono text-[var(--accent)]">LIVE_STREAM</span>
                    </div>
                  )}
                  <div className="emotion-card">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-mono text-sm" style={{ color: getEmotionColor(result.emotion) }}>
                        {result.confidence < confidenceThreshold ? 'UNCERTAIN' : result.emotion.toUpperCase()}
                      </span>
                      <span className="font-mono text-sm text-[var(--text)]">
                        {(result.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    {result.confidence < confidenceThreshold && (
                      <div className="flex items-center gap-1 text-[8px] text-[var(--danger)] font-mono mb-2 uppercase tracking-tighter">
                        <ShieldAlert size={8} />
                        Signal noise above threshold
                      </div>
                    )}
                    <div className="h-1 w-full bg-black rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full" 
                        style={{ backgroundColor: getEmotionColor(result.emotion) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${result.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="p-4 bg-white/[0.02] border border-white/5 rounded text-[11px] leading-relaxed text-[var(--text-muted)] italic">
                    {result.reasoning}
                  </div>

                  {/* Acoustic Breakdown */}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="p-2 bg-black/20 border border-white/5 rounded flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <TrendingUp size={10} className="text-blue-400" />
                        <span className="text-[8px] font-mono tracking-tighter uppercase">Pitch</span>
                      </div>
                      <span className="text-[9px] font-mono text-white/80 truncate font-medium">
                        {result.features?.pitch || '--'}
                      </span>
                    </div>
                    <div className="p-2 bg-black/20 border border-white/5 rounded flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Wind size={10} className="text-teal-400" />
                        <span className="text-[8px] font-mono tracking-tighter uppercase">Tempo</span>
                      </div>
                      <span className="text-[9px] font-mono text-white/80 truncate font-medium">
                        {result.features?.tempo || '--'}
                      </span>
                    </div>
                    <div className="p-2 bg-black/20 border border-white/5 rounded flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Zap size={10} className="text-yellow-400" />
                        <span className="text-[8px] font-mono tracking-tighter uppercase">Energy</span>
                      </div>
                      <span className="text-[9px] font-mono text-white/80 truncate font-medium">
                        {result.features?.energy || '--'}
                      </span>
                    </div>
                  </div>

                  {result.transcription && (
                    <div className="emotion-card !p-4 !bg-[var(--bg)] border-dashed">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={10} className="text-[var(--accent)]" />
                        <span className="status-label text-[8px]">Verbatim Transcript</span>
                      </div>
                      <p className="text-[10px] font-mono leading-relaxed text-[var(--accent)]/80">
                        {result.transcription}
                      </p>
                    </div>
                  )}

                  {audioUrl && !isRecording && (
                    <div className="flex flex-col gap-2 mt-4">
                      <span className="status-label border-b border-white/5 pb-1 mb-1">Session Asset</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={togglePlayback}
                          className="flex-1 py-1.5 border border-white/10 hover:bg-white/5 text-[10px] font-mono flex items-center justify-center gap-2 uppercase tracking-tighter"
                        >
                          {isPlaying ? <Pause size={10} /> : <Play size={10} />}
                          {isPlaying ? 'PAUSE_REPLAY' : 'REPLAY_SAMPLE'}
                        </button>
                        <button 
                          onClick={downloadSample}
                          className="px-3 border border-white/10 hover:bg-white/5 text-[var(--text-muted)] hover:text-white"
                          title="Download Sample"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="py-20 text-center flex flex-col items-center gap-4 opacity-20">
                  <Activity size={40} />
                  <span className="status-label">No Signal Detected</span>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title !mb-0">Sensitivity // Threshold</h2>
              <Sliders size={12} className="text-[var(--text-muted)]" />
            </div>
            <div className="p-4 bg-[var(--surface)] border border-white/5 rounded-sm flex flex-col gap-3">
              <div className="flex justify-between font-mono text-[9px] text-[var(--text-muted)] uppercase italic">
                <span>Robust</span>
                <span>High Sensitivity</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={confidenceThreshold * 100}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value) / 100)}
                className="w-full accent-[var(--accent)] h-1 bg-black rounded-full cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-[var(--accent)]">THRESHOLD: {(confidenceThreshold * 100).toFixed(0)}%</span>
                <span className="text-[8px] font-mono text-[var(--text-muted)] opacity-50">FILTER_GIG: ACTIVE</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="section-title">Feature Extraction</h2>
            <div className="grid grid-cols-2 gap-4">
              <MetricBox label="RMS Energy" value={features.rms?.toFixed(4) || '0.000'} />
              <MetricBox label="ZCR" value={features.zcr?.toFixed(3) || '0.000'} />
              <MetricBox label="Spectral Centroid" value={`${features.spectralCentroid?.toFixed(0) || '0'}Hz`} />
              <MetricBox label="Rolloff" value={`${features.spectralRolloff?.toFixed(0) || '0'}`} />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <div className="tag">SOURCE: input_stream.vcl</div>
            <div className="tag">MODEL: {result ? 'GEMINI_V3_FLASH' : 'SYSTEM_READY'}</div>
            <div className="timer-display mt-2 flex justify-between">
              <span>UPTIME: {formatTime(timer)}</span>
              <span>PID: 4921</span>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-[40px] bg-black px-10 flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] border-t border-white/5">
        <div>&copy; 2026 AI.LABS // AUDIO ANALYTICS</div>
        <div>SR: 44100HZ | BUFFER: 512ms | LATENCY: {(features.rms || 0) > 0 ? '12ms' : '--'}</div>
      </footer>
    </div>
  );
}

function MetricBox({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="metric-label">{label}</span>
      <span className="metric-val">{value}</span>
    </div>
  );
}

function FeatureItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center p-2 rounded hover:bg-white/5 transition-colors">
      <span className="status-label opacity-60">{label}</span>
      <span className="text-white text-xs font-mono">{value}</span>
    </div>
  );
}
