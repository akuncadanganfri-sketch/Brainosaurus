/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Menu, 
  X, 
  Play, 
  Trophy, 
  BookOpen, 
  ChevronRight, 
  ArrowLeft, 
  Timer, 
  Star,
  Info,
  RotateCcw,
  ArrowUp,
  ArrowRight,
  ArrowLeft as ArrowLeftIcon,
  Sparkles,
  Settings,
  Lock,
  User,
  Medal,
  Compass,
  Swords,
  Map,
  Crown,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Subject, Question, GameState, LeaderboardEntry } from './types';
import { generateQuestions, generateKisiKisi } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  increment,
  getDocFromServer
} from 'firebase/firestore';

// --- Constants ---
const SUBJECTS: Subject[] = [
  'Matematika', 
  'Informatika', 
  'Bahasa Indonesia', 
  'Bahasa Inggris', 
  'PKN', 
  'Sejarah', 
  'Seni Budaya',
  'PKWU'
];

const GAME_DURATION = 10 * 60; // 10 minutes in seconds

// --- Achievement Levels ---
const ACHIEVEMENTS = [
  { level: 1, name: 'Explorer', minScore: 0, maxScore: 300, icon: Compass, color: 'text-gray-400', bg: 'bg-gray-100' },
  { level: 2, name: 'Challenger', minScore: 300, maxScore: 700, icon: Swords, color: 'text-amber-600', bg: 'bg-amber-50' },
  { level: 3, name: 'Adventurer', minScore: 700, maxScore: 1000, icon: Map, color: 'text-blue-500', bg: 'bg-blue-50' },
  { level: 4, name: 'Legend', minScore: 1000, maxScore: 2000, icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-50' },
  { level: 5, name: 'Champion', minScore: 2000, maxScore: Infinity, icon: Trophy, color: 'text-purple-600', bg: 'bg-purple-50' },
];

const getAchievement = (score: number) => {
  return ACHIEVEMENTS.find(a => score >= a.minScore && score < a.maxScore) || ACHIEVEMENTS[0];
};

const AchievementBadge = ({ score, size = 20, showName = false }: { score: number, size?: number, showName?: boolean }) => {
  const achievement = getAchievement(score);
  const Icon = achievement.icon;
  
  return (
    <div className={`inline-flex items-center gap-2 ${achievement.bg} ${achievement.color} px-2 py-1 rounded-lg border border-current/10`}>
      <Icon size={size} />
      {showName && <span className="text-xs font-bold uppercase tracking-wider">{achievement.name}</span>}
    </div>
  );
};

// --- Audio Utility ---
const playFeedbackSound = (isCorrect: boolean) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (isCorrect) {
      // Happy "ding"
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1); // C6
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } else {
      // Sad "buzz"
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn("Audio not supported", e);
  }
};

// --- Components ---

const Sidebar = ({ 
  isOpen, 
  onClose, 
  onShowInstructions, 
  onShowLeaderboard,
  onShowSettings,
  onShowAchievements,
  onLogout
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onShowInstructions: () => void;
  onShowLeaderboard: () => void;
  onShowSettings: () => void;
  onShowAchievements: () => void;
  onLogout: () => void;
}) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 shadow-2xl p-6 flex flex-col"
        >
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-indigo-600">Brainosaurus</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X size={24} />
            </button>
          </div>
          
          <nav className="space-y-4 flex-1">
            <button 
              onClick={() => { onShowInstructions(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-xl text-gray-700 hover:text-indigo-600 transition-colors"
            >
              <Info size={20} />
              <span>Petunjuk</span>
            </button>
            <button 
              onClick={() => { onShowLeaderboard(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-xl text-gray-700 hover:text-indigo-600 transition-colors"
            >
              <Trophy size={20} />
              <span>Papan Peringkat</span>
            </button>
            <button 
              onClick={() => { onShowAchievements(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-xl text-gray-700 hover:text-indigo-600 transition-colors"
            >
              <Medal size={20} />
              <span>Pencapaian</span>
            </button>
            <button 
              onClick={() => { onShowSettings(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-xl text-gray-700 hover:text-indigo-600 transition-colors"
            >
              <Settings size={20} />
              <span>Pengaturan</span>
            </button>
            <button 
              onClick={() => { onLogout(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 hover:bg-rose-50 rounded-xl text-rose-600 transition-colors"
            >
              <LogOut size={20} />
              <span>Keluar</span>
            </button>
          </nav>
          
          <div className="mt-auto pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
            Brainosaurus v1.0
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const DinoGame = ({ 
  onLevelReached, 
  onFall,
  isPaused 
}: { 
  onLevelReached: (level: number) => void;
  onFall: () => void;
  isPaused: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef({ up: false, right: false, left: false });
  
  // Game state in refs for the loop
  const gameState = useRef({
    dino: { x: 50, y: 0, width: 60, height: 70, vy: 0, jumping: false, jumpTimer: 0 },
    platforms: [] as { x: number, y: number, baseY: number, width: number, height: number, level: number, phase: number }[],
    clouds: [] as { x: number, y: number, scale: number, speed: number }[],
    cameraX: 0,
    cameraY: 0,
    currentLevel: 0,
    lastLevelReached: 0,
    groundY: 0,
    initialized: false,
    hasFallen: false,
    onGround: true,
    dinoImage: null as HTMLImageElement | null
  });

  useEffect(() => {
    const img = new Image();
    // High-quality Dino SVG matching the user's provided icon
    img.src = 'https://image2url.com/r2/default/images/1772690543219-9fb02b21-04a7-4324-b95b-a623b0b67f23.png';
    img.onload = () => {
      gameState.current.dinoImage = img;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === ' ') controlsRef.current.up = true;
      if (e.key === 'ArrowRight') controlsRef.current.right = true;
      if (e.key === 'ArrowLeft') controlsRef.current.left = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === ' ') controlsRef.current.up = false;
      if (e.key === 'ArrowRight') controlsRef.current.right = false;
      if (e.key === 'ArrowLeft') controlsRef.current.left = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Set canvas size to container size
    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      gameState.current.groundY = canvas.height - 60;
      if (!gameState.current.initialized) {
        gameState.current.dino.y = gameState.current.groundY - gameState.current.dino.height;
        
        // Initialize platforms - closer together and with oscillation data
        const platforms = [];
        for (let i = 1; i <= 10; i++) {
          platforms.push({
            x: i * 220, // Closer spacing
            baseY: gameState.current.groundY - (i * 60) - 60,
            y: 0,
            width: 120,
            height: 30,
            level: i,
            phase: Math.random() * Math.PI * 2
          });
        }
        gameState.current.platforms = platforms;

        // Initialize clouds
        const clouds = [];
        for (let i = 0; i < 10; i++) {
          clouds.push({
            x: Math.random() * 3000,
            y: 50 + Math.random() * 150,
            scale: 0.5 + Math.random() * 0.8,
            speed: 0.2 + Math.random() * 0.5
          });
        }
        gameState.current.clouds = clouds;
        gameState.current.initialized = true;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    let animationFrameId: number;

    const update = () => {
      if (isPaused) {
        animationFrameId = requestAnimationFrame(update);
        return;
      }

      const { dino, platforms, groundY, clouds } = gameState.current;
      const controls = controlsRef.current;
      const time = Date.now() / 1000;

      // Update platforms oscillation
      platforms.forEach(p => {
        p.y = p.baseY + Math.sin(time * 1.5 + p.phase) * 15;
      });

      // Controls
      if (controls.up) {
        if (!dino.jumping && gameState.current.onGround) {
          dino.vy = -12;
          dino.jumping = true;
          dino.jumpTimer = 0;
          gameState.current.onGround = false;
        } else if (dino.jumping && dino.jumpTimer < 45) {
          // Significantly enhanced variable jump height: apply more upward force while button is held
          dino.vy -= 1.3;
          dino.jumpTimer++;
        }
      }
      if (controls.right) {
        dino.x += 6;
      }
      if (controls.left) {
        dino.x -= 6;
      }

      // Gravity
      dino.vy += 0.6;
      dino.y += dino.vy;

      // Ground collision
      if (dino.y > groundY - dino.height) {
        const wasInAir = !gameState.current.onGround;
        dino.y = groundY - dino.height;
        dino.vy = 0;
        dino.jumping = false;
        
        // Fall penalty logic: deduct point every time he hits the ground if he has reached a platform
        if (wasInAir && gameState.current.lastLevelReached > 0) {
          onFall();
        }
        gameState.current.onGround = true;
      }

      // Platform collision
      let onAnyPlatform = false;
      platforms.forEach(p => {
        if (
          dino.x + dino.width > p.x &&
          dino.x < p.x + p.width &&
          dino.y + dino.height > p.y &&
          dino.y + dino.height < p.y + p.height + dino.vy &&
          dino.vy >= 0
        ) {
          dino.y = p.y - dino.height;
          dino.vy = 0;
          dino.jumping = false;
          onAnyPlatform = true;

          if (p.level !== gameState.current.currentLevel) {
            gameState.current.currentLevel = p.level;
            gameState.current.lastLevelReached = Math.max(gameState.current.lastLevelReached, p.level);
            onLevelReached(p.level);
          }
          gameState.current.hasFallen = false;
          gameState.current.onGround = true;
        }
      });

      if (!onAnyPlatform && dino.y < groundY - dino.height) {
        gameState.current.currentLevel = 0;
      }

      // Update clouds
      clouds.forEach(c => {
        c.x -= c.speed;
        if (c.x < -200) c.x = 3000;
      });

      // Camera follow
      gameState.current.cameraX = dino.x - 150;
      const targetCameraY = Math.min(0, dino.y - canvas.height * 0.6);
      gameState.current.cameraY += (targetCameraY - gameState.current.cameraY) * 0.1;

      draw();
      animationFrameId = requestAnimationFrame(update);
    };

    const draw = () => {
      const { dino, platforms, cameraX, cameraY, groundY, clouds } = gameState.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Sky Background
      const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      skyGradient.addColorStop(0, '#87CEEB');
      skyGradient.addColorStop(1, '#E0F7FA');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(-cameraX, -cameraY);

      // Draw Clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      clouds.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 20 * c.scale, 0, Math.PI * 2);
        ctx.arc(c.x + 15 * c.scale, c.y - 10 * c.scale, 20 * c.scale, 0, Math.PI * 2);
        ctx.arc(c.x + 30 * c.scale, c.y, 20 * c.scale, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Rice Fields
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#4CAF50' : '#8BC34A';
        ctx.beginPath();
        ctx.moveTo(cameraX - 500 + i * 400, groundY);
        ctx.quadraticCurveTo(cameraX - 500 + i * 400 + 200, groundY - 100, cameraX - 500 + i * 400 + 400, groundY);
        ctx.fill();
      }

      // Draw Ground
      ctx.fillStyle = '#3E2723';
      ctx.fillRect(cameraX - 500, groundY, canvas.width + 1000, 200);
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(cameraX - 500, groundY, canvas.width + 1000, 15);

      // Draw Floating Islands
      platforms.forEach(p => {
        ctx.fillStyle = '#795548';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 10);
        ctx.lineTo(p.x + p.width, p.y + 10);
        ctx.lineTo(p.x + p.width - 20, p.y + p.height + 20);
        ctx.lineTo(p.x + 20, p.y + p.height + 20);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#43A047';
        ctx.beginPath();
        ctx.roundRect(p.x - 5, p.y, p.width + 10, 15, 5);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Level ${p.level}`, p.x + p.width / 2, p.y + 12);
      });

      // Draw Dino
      ctx.save();
      ctx.translate(dino.x, dino.y);
      
      if (gameState.current.dinoImage && gameState.current.dinoImage.complete) {
        ctx.drawImage(gameState.current.dinoImage, 0, 0, dino.width, dino.height);
      } else {
        // Better fallback Dino
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.roundRect(0, 0, dino.width, dino.height, 10);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(dino.width * 0.8, dino.height * 0.3, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(dino.width * 0.82, dino.height * 0.3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.restore();
    };

    update();
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPaused, onLevelReached]);

  const handleControl = (key: 'up' | 'right' | 'left', active: boolean) => {
    controlsRef.current[key] = active;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-sky-100 overflow-hidden flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block"
        />
      </div>
      
      {/* Controls Area (Ground) */}
      <div className="h-36 bg-[#3E2723] border-t-8 border-[#2E7D32] flex items-center justify-center gap-8 px-8 z-50 relative shrink-0">
        <button 
          onMouseDown={() => handleControl('left', true)}
          onMouseUp={() => handleControl('left', false)}
          onMouseLeave={() => handleControl('left', false)}
          onTouchStart={(e) => { e.preventDefault(); handleControl('left', true); }}
          onTouchEnd={(e) => { e.preventDefault(); handleControl('left', false); }}
          className="w-20 h-20 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform border-2 border-indigo-100 select-none touch-none z-50"
        >
          <ArrowLeftIcon size={40} className="text-indigo-600" />
        </button>
        <button 
          onMouseDown={() => handleControl('up', true)}
          onMouseUp={() => handleControl('up', false)}
          onMouseLeave={() => handleControl('up', false)}
          onTouchStart={(e) => { e.preventDefault(); handleControl('up', true); }}
          onTouchEnd={(e) => { e.preventDefault(); handleControl('up', false); }}
          className="w-24 h-24 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform border-2 border-indigo-100 select-none touch-none z-50"
        >
          <ArrowUp size={48} className="text-indigo-600" />
        </button>
        <button 
          onMouseDown={() => handleControl('right', true)}
          onMouseUp={() => handleControl('right', false)}
          onMouseLeave={() => handleControl('right', false)}
          onTouchStart={(e) => { e.preventDefault(); handleControl('right', true); }}
          onTouchEnd={(e) => { e.preventDefault(); handleControl('right', false); }}
          className="w-20 h-20 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform border-2 border-indigo-100 select-none touch-none z-50"
        >
          <ArrowRight size={40} className="text-indigo-600" />
        </button>
      </div>
    </div>
  );
};

const SUBJECT_PLACEHOLDERS: Record<string, string> = {
  'Matematika': 'Contoh: Perkalian pecahan, Bangun ruang, Aljabar...',
  'Informatika': 'Contoh: Algoritma, Pemrograman dasar, Jaringan komputer...',
  'Bahasa Indonesia': 'Contoh: Puisi, Teks eksplanasi, Majas...',
  'Bahasa Inggris': 'Contoh: Tenses, Narrative text, Vocabulary...',
  'PKN': 'Contoh: Pancasila, UUD 1945, Hak asasi manusia...',
  'Sejarah': 'Contoh: Kerajaan Majapahit, Perang Diponegoro, Proklamasi...',
  'Seni Budaya': 'Contoh: Seni lukis, Alat musik tradisional, Tari daerah...',
  'PKWU': 'Contoh: Kewirausahaan, Budidaya tanaman, Kerajinan tangan...'
};

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorInfo: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Terjadi kesalahan pada aplikasi.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || "");
        if (parsed.error && parsed.error.includes("permissions")) {
          displayMessage = "Maaf, Anda tidak memiliki izin untuk melakukan aksi ini. Harap hubungi administrator atau periksa konfigurasi Firebase Anda.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4 border-2 border-rose-100">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-800">Ups! Ada Masalah</h2>
            <p className="text-slate-600 font-medium">{displayMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [view, setView] = useState<'login' | 'home' | 'intro' | 'game' | 'result' | 'leaderboard' | 'instructions' | 'settings' | 'achievements' | 'complete-profile'>('login');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [isWrongAnswer, setIsWrongAnswer] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    correctCount: 0,
    firstTryCorrectCount: 0,
    lastAnsweredLevel: 0,
    currentLevel: 0,
    timeLeft: GAME_DURATION,
    isGameOver: false,
    subject: null,
    questions: []
  });
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [isCurrentQuestionFirstTry, setIsCurrentQuestionFirstTry] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGeneratingKisiKisi, setIsGeneratingKisiKisi] = useState(false);
  const [kisiKisi, setKisiKisi] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardType, setLeaderboardType] = useState<'userSubjects' | 'classRanking'>('classRanking');
  const [subjectTotalScore, setSubjectTotalScore] = useState(0);
  const [userName, setUserName] = useState('');
  const [userClassCode, setUserClassCode] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [levelNotification, setLevelNotification] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Check if profile exists
        const path = `users/${user.uid}`;
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserName(userData.name);
            setUserClassCode(userData.classCode);
            setTotalScore(userData.totalScore || 0);
            setIsLoggedIn(true);
            setView('home');
          } else {
            // New user, need to complete profile
            setUserName(user.displayName || '');
            setView('complete-profile');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }

        // Real-time listener for user data (score sync)
        const userUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setTotalScore(data.totalScore || 0);
            setUserName(data.name || '');
            setUserClassCode(data.classCode || '');
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        });

        return () => {
          userUnsubscribe();
        };
      } else {
        setIsLoggedIn(false);
        setView('login');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // --- Connection Test ---
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const handleEmailLogin = async () => {
    setAuthError(null);
    if (!userEmail || !userPassword) {
      setAuthError('Harap isi email dan password!');
      return;
    }
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, userEmail, userPassword);
      } else {
        await signInWithEmailAndPassword(auth, userEmail, userPassword);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      const errorCode = error.code;
      
      if (errorCode === 'auth/user-not-found') {
        setAuthError('Email tidak ditemukan. Silakan daftar terlebih dahulu.');
      } else if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        setAuthError('Email atau password salah.');
      } else if (errorCode === 'auth/email-already-in-use') {
        setAuthError('Email sudah terdaftar. Silakan masuk.');
      } else if (errorCode === 'auth/weak-password') {
        setAuthError('Password terlalu lemah. Gunakan minimal 6 karakter.');
      } else if (errorCode === 'auth/too-many-requests') {
        setAuthError('Terlalu banyak percobaan. Silakan coba lagi nanti.');
      } else if (errorCode === 'auth/network-request-failed') {
        setAuthError('Koneksi jaringan gagal. Periksa internet Anda.');
      } else if (errorCode === 'auth/operation-not-allowed') {
        setAuthError('Metode login email/password belum diaktifkan di Firebase Console.');
      } else {
        setAuthError(`Kesalahan: ${errorCode || 'Terjadi kesalahan autentikasi.'}`);
      }
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Google login error:', error);
      if (error.code === 'auth/popup-blocked') {
        setAuthError('Popup diblokir oleh browser. Izinkan popup untuk masuk.');
      } else {
        setAuthError('Gagal masuk dengan Google.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsLoggedIn(false);
      setView('login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleCompleteProfile = async () => {
    if (!currentUser || !userName || !userClassCode) {
      alert('Harap isi nama dan kode kelas!');
      return;
    }
    const path = `users/${currentUser.uid}`;
    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        name: userName,
        email: currentUser.email,
        classCode: userClassCode,
        totalScore: 0,
        totalFirstTry: 0,
        timestamp: serverTimestamp()
      });
      setIsLoggedIn(true);
      setView('home');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const fetchTotalScore = useCallback(async () => {
    // Handled by onSnapshot in auth useEffect
  }, []);

  const fetchSubjectTotalScore = useCallback(async (subject: string) => {
    if (!currentUser) return;
    try {
      const q = query(
        collection(db, 'leaderboard'),
        where('uid', '==', currentUser.uid),
        where('subject', '==', subject)
      );
      const querySnapshot = await getDocs(q);
      let total = 0;
      querySnapshot.docs.forEach(doc => {
        total += doc.data().score || 0;
      });
      setSubjectTotalScore(total);
    } catch (error) {
      console.error('Error fetching subject total score:', error);
    }
  }, [currentUser]);

  const submitScore = useCallback(async () => {
    if (!currentUser || !selectedSubject || hasSubmitted) {
      return;
    }
    setHasSubmitted(true);
    try {
      const scoreData = {
        name: userName,
        classCode: userClassCode,
        subject: selectedSubject,
        score: gameState.score,
        correctAnswers: gameState.correctCount,
        firstTryCorrect: gameState.firstTryCorrectCount,
        timestamp: serverTimestamp(),
        uid: currentUser.uid
      };
      
      // 1. Add to leaderboard
      try {
        await addDoc(collection(db, 'leaderboard'), scoreData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'leaderboard');
      }
      
      // 2. Update user total score
      const userPath = `users/${currentUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          totalScore: increment(gameState.score),
          totalFirstTry: increment(gameState.firstTryCorrectCount),
          timestamp: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  }, [currentUser, userName, userClassCode, selectedSubject, gameState.score, gameState.correctCount, gameState.firstTryCorrectCount]);

  // Timer logic
  useEffect(() => {
    let timer: number;
    if (view === 'game' && gameState.timeLeft > 0 && !currentQuestion) {
      timer = window.setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft <= 1) {
            clearInterval(timer);
            setView('result');
            // Automatically submit score when time runs out
            submitScore();
            return { ...prev, timeLeft: 0, isGameOver: true };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [view, currentQuestion, gameState.timeLeft]);

  const handleStartGame = async (subject: Subject) => {
    setSelectedSubject(subject);
    setView('intro');
    setCustomTopic('');
    setHasSubmitted(false);
    fetchSubjectTotalScore(subject);
  };

  const handleGenerateKisiKisi = async () => {
    if (!selectedSubject || !customTopic) return;
    setIsGeneratingKisiKisi(true);
    try {
      const result = await generateKisiKisi(selectedSubject, customTopic);
      setKisiKisi(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingKisiKisi(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!selectedSubject) return;
    setIsLoadingQuestions(true);
    try {
      const questions = await generateQuestions(selectedSubject, customTopic);
      setGameState({
        score: 0,
        correctCount: 0,
        firstTryCorrectCount: 0,
        lastAnsweredLevel: 0,
        currentLevel: 0,
        timeLeft: GAME_DURATION,
        isGameOver: false,
        subject: selectedSubject,
        questions: questions
      });
      setView('game');
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const handleLevelReached = useCallback((level: number) => {
    // Only show question if it's the next level in sequence
    if (level === gameState.lastAnsweredLevel + 1) {
      const question = gameState.questions.find(q => q.difficulty === level);
      if (question) {
        setCurrentQuestion(question);
        setIsCurrentQuestionFirstTry(true);
        setLevelNotification(null);
      }
    } else if (level > gameState.lastAnsweredLevel + 1) {
      // Show notification if skipping levels
      setLevelNotification(gameState.lastAnsweredLevel + 1);
      // Auto-hide notification after 3 seconds
      setTimeout(() => setLevelNotification(null), 3000);
    }
  }, [gameState.lastAnsweredLevel, gameState.questions]);

  const handleFall = useCallback(() => {
    playFeedbackSound(false);
    setGameState(prev => ({
      ...prev,
      score: Math.max(0, prev.score - 1)
    }));
  }, []);

  const handleAnswer = (index: number) => {
    if (!currentQuestion) return;

    if (index === currentQuestion.correctAnswer) {
      playFeedbackSound(true);
      const wasFirstTry = isCurrentQuestionFirstTry;
      const newCorrectCount = gameState.correctCount + 1;
      const newFirstTryCorrectCount = wasFirstTry ? gameState.firstTryCorrectCount + 1 : gameState.firstTryCorrectCount;
      
      setGameState(prev => ({
        ...prev,
        score: prev.score + 10,
        correctCount: newCorrectCount,
        firstTryCorrectCount: newFirstTryCorrectCount,
        lastAnsweredLevel: currentQuestion.difficulty,
        currentLevel: currentQuestion.difficulty
      }));
      setCurrentQuestion(null);
      setIsWrongAnswer(false);
      
      if (currentQuestion.difficulty === 10 || newCorrectCount === 10) {
        // Automatically submit score when game is finished
        submitScore();
        setTimeout(() => setView('result'), 500);
      }
    } else {
      playFeedbackSound(false);
      setIsWrongAnswer(true);
      setIsCurrentQuestionFirstTry(false);
      setGameState(prev => ({
        ...prev,
        score: Math.max(0, prev.score - 3)
      }));
      // Reset shake after animation
      setTimeout(() => setIsWrongAnswer(false), 500);
      // User stays on the same question modal
    }
  };

  useEffect(() => {
    // Handled by onSnapshot in auth useEffect
  }, [isLoggedIn]);

  const fetchLeaderboard = async () => {
    if (!currentUser) return;
    try {
      let data: any[] = [];
      if (leaderboardType === 'userSubjects') {
        const q = query(
          collection(db, 'leaderboard'),
          where('uid', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        const subjectMap: Record<string, any> = {};
        querySnapshot.docs.forEach(doc => {
          const docData = doc.data();
          const subject = docData.subject;
          if (!subjectMap[subject]) {
            subjectMap[subject] = { ...docData, score: 0, count: 0 };
          }
          subjectMap[subject].score += docData.score;
          subjectMap[subject].count += 1;
        });
        data = Object.values(subjectMap).sort((a, b) => b.score - a.score);
      } else {
        let q;
        if (leaderboardType === 'classRanking' && userClassCode) {
          q = query(
            collection(db, 'users'),
            where('classCode', '==', userClassCode),
            orderBy('totalScore', 'desc'),
            limit(50)
          );
        } else {
          q = query(
            collection(db, 'users'),
            orderBy('totalScore', 'desc'),
            limit(50)
          );
        }
        
        const querySnapshot = await getDocs(q);
        data = querySnapshot.docs.map(doc => {
          const docData = doc.data();
          return {
            id: doc.id,
            ...(docData as any)
          };
        });
      }
      
      setLeaderboard(data);
      setView('leaderboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, leaderboardType === 'userSubjects' ? 'leaderboard' : 'users');
    }
  };

  useEffect(() => {
    if (view === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [view, leaderboardType]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-sky-50 font-sans text-slate-900 overflow-x-hidden relative">
      {/* Background for Home/Intro */}
      {(view === 'home' || view === 'intro' || view === 'instructions' || view === 'login' || view === 'settings') && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          {/* Sky */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-300 to-sky-100" />
          
          {/* Rice Fields / Hills */}
          <div className="absolute bottom-0 left-0 right-0 h-64 flex items-end">
            {[0, 1, 2, 3, 4].map((i) => (
              <div 
                key={i}
                className="flex-1 h-32 bg-emerald-500 rounded-t-full -mb-16 -mx-8 relative"
                style={{ 
                  backgroundColor: i % 2 === 0 ? '#4CAF50' : '#8BC34A',
                  height: `${100 + Math.sin(i) * 50}px`
                }}
              />
            ))}
          </div>
          
          {/* Ground */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#3E2723] border-t-8 border-[#2E7D32]" />
        </div>
      )}

      {/* Header */}
      {view !== 'game' && view !== 'login' && (
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-30">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-emerald-50 rounded-lg transition-colors text-emerald-700"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
            Brainosaurus
          </h1>
          <div className="w-10" /> {/* Spacer */}
        </header>
      )}

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        onShowInstructions={() => setView('instructions')}
        onShowLeaderboard={() => fetchLeaderboard()}
        onShowSettings={() => setView('settings')}
        onShowAchievements={() => setView('achievements')}
        onLogout={handleLogout}
      />

      <main className="max-w-4xl mx-auto p-6 relative z-10">
        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-md mx-auto bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-4 border-white space-y-6 mt-12"
            >
              <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4 shadow-inner">
                  <Sparkles size={40} />
                </div>
                <h2 className="text-3xl font-black text-emerald-800">Brainosaurus</h2>
                <p className="text-emerald-900/70 font-medium">
                  Selamat datang! Siap untuk memulai petualangan baru hari ini?
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">Email</label>
                  <input 
                    type="email" 
                    value={userEmail || ''}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full p-4 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 outline-none transition-all font-bold text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">Password</label>
                  <input 
                    type="password" 
                    value={userPassword || ''}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Min. 6 karakter"
                    className="w-full p-4 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 outline-none transition-all font-bold text-slate-700"
                  />
                </div>

                {authError && (
                  <p className="text-rose-500 text-sm font-bold text-center bg-rose-50 p-2 rounded-lg border border-rose-100">
                    {authError}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleEmailLogin}
                  className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all"
                >
                  Masuk
                </button>
              </div>
            </motion.div>
          )}

          {view === 'complete-profile' && (
            <motion.div
              key="complete-profile"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-4 border-white space-y-6 mt-12"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black text-emerald-800">Lengkapi Profil</h2>
                <p className="text-slate-600">Sedikit lagi untuk memulai petualangan!</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">Nama Lengkap</label>
                  <input 
                    type="text" 
                    value={userName || ''}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Masukkan namamu..."
                    className="w-full p-4 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 outline-none transition-all font-bold text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">Kode Kelas</label>
                  <input 
                    type="text" 
                    value={userClassCode || ''}
                    onChange={(e) => setUserClassCode(e.target.value)}
                    placeholder="Masukkan kode kelas..."
                    className="w-full p-4 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 outline-none transition-all font-bold text-slate-700"
                  />
                </div>
              </div>

              <button
                onClick={handleCompleteProfile}
                className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all"
              >
                Mulai Belajar
              </button>
            </motion.div>
          )}

          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-white/40 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-white/50 shadow-xl relative overflow-hidden flex flex-col items-center text-center">
                <div className="space-y-2 mb-6">
                  <h2 className="text-3xl sm:text-4xl font-black text-emerald-800">Selamat Datang, {userName || 'Siswa'}!</h2>
                  <p className="text-emerald-900/70 font-medium text-base sm:text-lg">Pilih mata pelajaran untuk mulai petualangan belajarmu.</p>
                </div>
                
                <div className="w-full flex flex-wrap justify-center gap-3">
                  <AchievementBadge score={totalScore} size={24} showName />
                  <div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg border-2 border-white/20 flex items-center gap-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">Total Skor</p>
                      <p className="text-2xl font-black">{totalScore}</p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        // Real-time sync is active, but manual refresh can trigger a re-fetch if needed
                        const userDocRef = doc(db, 'users', currentUser?.uid || '');
                        getDoc(userDocRef).then(docSnap => {
                          if (docSnap.exists()) {
                            setTotalScore(docSnap.data().totalScore || 0);
                          }
                        });
                      }}
                      className="p-2 hover:bg-white/20 rounded-full transition-colors"
                      title="Refresh Skor"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    onClick={() => handleStartGame(subject)}
                    className="group relative bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border-2 border-white/50 hover:border-emerald-400 hover:shadow-emerald-200/50 transition-all text-left flex items-center justify-between overflow-hidden"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-inner">
                        <BookOpen size={24} />
                      </div>
                      <span className="font-bold text-lg text-slate-800">{subject}</span>
                    </div>
                    <ChevronRight className="text-emerald-300 group-hover:text-emerald-600 transition-colors" />
                    <div className="absolute bottom-0 left-0 h-1.5 w-0 bg-emerald-600 group-hover:w-full transition-all duration-300" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'intro' && selectedSubject && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-4 border-white space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <button onClick={() => { setView('home'); setKisiKisi(''); }} className="p-2 hover:bg-emerald-50 rounded-full text-emerald-600 shrink-0">
                    <ArrowLeft size={24} />
                  </button>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-800 truncate">{selectedSubject}</h2>
                </div>
                <div className="bg-emerald-600 text-white px-4 py-2 rounded-2xl shadow-lg flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">Skor Mapel</p>
                    <p className="text-xl font-black">{subjectTotalScore}</p>
                  </div>
                  <button 
                    onClick={() => fetchSubjectTotalScore(selectedSubject)}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    title="Refresh Skor"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {!kisiKisi ? (
                <div className="space-y-6">
                  <div className="space-y-3 bg-amber-50 p-6 rounded-2xl border-2 border-amber-100">
                    <label className="flex items-center gap-2 font-bold text-amber-800 text-sm mb-1">
                      <Sparkles size={16} className="text-amber-600" />
                      Materi apa yang baru saja kamu pelajari?
                    </label>
                    <textarea
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder={selectedSubject ? SUBJECT_PLACEHOLDERS[selectedSubject] : "Masukkan materi..."}
                      className="w-full p-4 rounded-xl border-2 border-amber-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition-all text-slate-700 bg-white resize-none h-32 font-medium"
                    />
                  </div>

                  <button
                    onClick={handleGenerateKisiKisi}
                    disabled={isGeneratingKisiKisi || !customTopic}
                    className="w-full py-5 bg-amber-500 text-white rounded-2xl font-black text-xl shadow-xl shadow-amber-200 hover:bg-amber-600 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 flex items-center justify-center gap-3 transition-all"
                  >
                    {isGeneratingKisiKisi ? (
                      <>
                        <RotateCcw className="animate-spin" />
                        Menganalisis Materi...
                      </>
                    ) : (
                      <>
                        <Sparkles size={24} />
                        Buat Soal
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-4 text-slate-700 leading-relaxed bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                    <p className="font-bold text-emerald-800 text-lg">Kisi-kisi Umum:</p>
                    <div className="prose prose-emerald max-w-none">
                      <ReactMarkdown>{kisiKisi}</ReactMarkdown>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setKisiKisi('')}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-lg hover:bg-slate-200 transition-all"
                    >
                      Ganti Materi
                    </button>
                    <button
                      onClick={handleGenerateQuestions}
                      disabled={isLoadingQuestions}
                      className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 flex items-center justify-center gap-3 transition-all"
                    >
                      {isLoadingQuestions ? (
                        <>
                          <RotateCcw className="animate-spin" />
                          Menyiapkan Game...
                        </>
                      ) : (
                        <>
                          <Play fill="currentColor" size={24} />
                          Mainkan Game
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-slate-900 flex flex-col"
            >
              {/* Game HUD */}
              <div className="flex justify-between items-center bg-white/10 backdrop-blur-md p-4 border-b border-white/10 text-white">
                <div className="flex items-center gap-2">
                  <Timer size={20} className="text-indigo-400" />
                  <span className="font-mono font-bold text-xl">{formatTime(gameState.timeLeft)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 bg-amber-400/20 px-3 py-1 rounded-full text-amber-400 border border-amber-400/30">
                    <Star size={16} fill="currentColor" />
                    <span className="font-bold">{gameState.score} Poin</span>
                  </div>
                  <div className="text-white/60 text-sm">
                    Soal: <span className="text-white font-bold">{gameState.currentLevel}/10</span>
                  </div>
                  <button 
                    onClick={() => {
                      submitScore();
                      setView('result');
                    }}
                    className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-1 rounded-full text-sm font-bold transition-colors shadow-lg"
                  >
                    Selesai
                  </button>
                </div>
                <button 
                  onClick={() => setView('home')}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Game Area - Full Screen */}
              <div className="flex-1 relative flex flex-col overflow-hidden">
                <DinoGame 
                  onLevelReached={handleLevelReached} 
                  onFall={handleFall}
                  isPaused={!!currentQuestion}
                />

                {/* Level Notification Popup */}
                <AnimatePresence>
                  {levelNotification !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: 50, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-amber-500 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold border-2 border-white flex items-center gap-3"
                    >
                      <Lock size={20} />
                      <span>Kerjakan soal level {levelNotification} terlebih dahulu!</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Question Modal */}
              <AnimatePresence>
                {currentQuestion && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1,
                      x: isWrongAnswer ? [0, -10, 10, -10, 10, 0] : 0
                    }}
                    transition={{ 
                      x: { duration: 0.4, ease: "easeInOut" }
                    }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                  >
                    <div className={`bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 space-y-6 border-4 ${isWrongAnswer ? 'border-rose-500' : 'border-emerald-500'}`}>
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Level {currentQuestion.difficulty}</span>
                        <h3 className="text-xl font-bold text-slate-800">{currentQuestion.text}</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {currentQuestion.options.map((option, idx) => {
                          const colors = [
                            'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
                            'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
                            'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100',
                            'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                          ];
                          return (
                            <button
                              key={idx}
                              onClick={() => handleAnswer(idx)}
                              className={`w-full p-4 text-left rounded-xl border-2 font-bold transition-all active:scale-[0.98] ${colors[idx % colors.length]}`}
                            >
                              <span className="inline-block w-8 font-black opacity-30">{String.fromCharCode(65 + idx)}.</span>
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      
                      {isWrongAnswer && (
                        <motion.p 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center text-rose-600 font-bold animate-pulse"
                        >
                          Jawaban Salah! Coba lagi ya!
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {view === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 backdrop-blur-md p-10 rounded-3xl shadow-2xl border-4 border-white text-center space-y-8"
            >
              <div className="space-y-4">
                <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner border-4 border-white">
                  <Trophy size={48} />
                </div>
                <h2 className="text-4xl font-black text-slate-800">Hebat! Selesai!</h2>
                <p className="text-slate-600 font-medium text-lg">Terima kasih telah berpetualang dan belajar bersama Dino.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-100 shadow-sm">
                  <p className="text-xs text-emerald-600 uppercase font-black tracking-widest mb-1">Total Poin</p>
                  <p className="text-4xl sm:text-5xl font-black text-emerald-700">{gameState.score}</p>
                </div>
                <div className="bg-sky-50 p-6 rounded-2xl border-2 border-sky-100 shadow-sm">
                  <p className="text-xs text-sky-600 uppercase font-black tracking-widest mb-1">Benar (1x Coba)</p>
                  <p className="text-4xl sm:text-5xl font-black text-sky-700">{gameState.firstTryCorrectCount}/10</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    submitScore();
                    fetchLeaderboard();
                  }}
                  className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:-translate-y-1 transition-all"
                >
                  Lihat Papan Peringkat
                </button>
                <button
                  onClick={() => {
                    submitScore();
                    setView('home');
                  }}
                  className="w-full py-5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xl hover:bg-slate-200 transition-all"
                >
                  Kembali ke Beranda
                </button>
              </div>
            </motion.div>
          )}

          {view === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <button onClick={() => setView('home')} className="p-2 hover:bg-white/50 rounded-full text-indigo-600 bg-white shadow-sm shrink-0">
                    <ArrowLeft size={24} />
                  </button>
                  <h2 className="text-2xl sm:text-3xl font-black text-indigo-900 truncate">Papan Peringkat</h2>
                </div>
                <div className="flex bg-white/50 p-1 rounded-xl border border-white shadow-sm w-full sm:w-auto">
                  <button 
                    onClick={() => setLeaderboardType('classRanking')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${leaderboardType === 'classRanking' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-600 hover:bg-white'}`}
                  >
                    Kelas
                  </button>
                  <button 
                    onClick={() => setLeaderboardType('userSubjects')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${leaderboardType === 'userSubjects' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-600 hover:bg-white'}`}
                  >
                    Mapel
                  </button>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-xl border-2 border-white overflow-hidden">
                <div className="p-6 border-b border-indigo-50 bg-indigo-50/30 flex justify-between items-center">
                  <p className="text-indigo-900/60 font-bold uppercase tracking-widest text-xs">
                    {leaderboardType === 'classRanking' ? `Peringkat Kelas ${userClassCode || '-'}` : 'Total Skor per Mata Pelajaran'}
                  </p>
                  <button 
                    onClick={() => fetchLeaderboard()}
                    className="p-2 hover:bg-indigo-100 rounded-full text-indigo-600 transition-colors"
                    title="Refresh"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {leaderboardType === 'classRanking' && !userClassCode ? (
                    <div className="p-12 text-center space-y-4">
                      <Lock size={48} className="mx-auto text-indigo-200" />
                      <p className="text-indigo-900/40 font-bold">Silakan masukkan kode kelas di pengaturan untuk melihat peringkat kelas.</p>
                      <button 
                        onClick={() => setView('settings')}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                      >
                        Buka Pengaturan
                      </button>
                    </div>
                  ) : leaderboard.length > 0 ? (
                    <div className="divide-y divide-indigo-50">
                      {leaderboard.map((entry, index) => (
                        <div key={entry.id || index} className="p-4 flex items-center justify-between hover:bg-indigo-50/30 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${
                              index === 0 ? 'bg-yellow-400 text-white shadow-lg' : 
                              index === 1 ? 'bg-slate-300 text-white shadow-md' : 
                              index === 2 ? 'bg-amber-600 text-white shadow-sm' : 
                              'bg-indigo-50 text-indigo-400'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-black text-indigo-900">{leaderboardType === 'classRanking' ? entry.name : entry.subject}</p>
                              <div className="flex items-center gap-2">
                                {leaderboardType === 'classRanking' ? (
                                  <AchievementBadge score={entry.totalScore || 0} size={14} showName />
                                ) : (
                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Mata Pelajaran</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-black text-indigo-600">{leaderboardType === 'classRanking' ? entry.totalScore : entry.score}</p>
                            <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Poin</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center space-y-4">
                      <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-300 mx-auto">
                        <Trophy size={32} />
                      </div>
                      <p className="text-indigo-900/40 font-bold">Belum ada data peringkat.</p>
                    </div>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => setView('home')}
                className="w-full py-4 bg-white/50 text-indigo-600 rounded-2xl font-bold hover:bg-white transition-all border border-white"
              >
                Kembali ke Beranda
              </button>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-4 border-white space-y-6"
            >
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 hover:bg-emerald-50 rounded-full text-emerald-600">
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-black text-slate-800">Pengaturan Profil</h2>
              </div>

              <div className="space-y-6">
                {settingsSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3 font-bold"
                  >
                    <Sparkles size={20} />
                    Berhasil memperbarui profil!
                  </motion.div>
                )}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">Nama Lengkap</label>
                  <input 
                    type="text" 
                    value={userName || ''}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Edit namamu..."
                    className="w-full p-4 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all font-bold text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">Kode Kelas</label>
                  <input 
                    type="text" 
                    value={userClassCode || ''}
                    onChange={(e) => setUserClassCode(e.target.value)}
                    placeholder="Masukkan kode kelas..."
                    className="w-full p-4 rounded-2xl border-2 border-emerald-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all font-bold text-slate-700"
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!currentUser) return;
                  if (!userName.trim() || !userClassCode.trim()) {
                    alert('Nama dan Kode Kelas tidak boleh kosong!');
                    return;
                  }
                  try {
                    await updateDoc(doc(db, 'users', currentUser.uid), {
                      name: userName,
                      classCode: userClassCode,
                      timestamp: serverTimestamp()
                    });
                    setSettingsSuccess(true);
                    setTimeout(() => setSettingsSuccess(false), 3000);
                  } catch (error) {
                    console.error('Error updating profile:', error);
                  }
                }}
                className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3"
              >
                Simpan Perubahan
              </button>
            </motion.div>
          )}

          {view === 'instructions' && (
            <motion.div
              key="instructions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 space-y-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-100 rounded-full">
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-2xl font-bold">Petunjuk Bermain</h2>
              </div>

              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="font-bold text-indigo-600 flex items-center gap-2">
                    <Play size={18} /> Cara Bermain
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Gunakan tombol <strong>Up</strong> untuk melompat dan <strong>Right</strong> untuk bergerak maju. 
                    Lompati platform untuk mencapai pulau terbang berikutnya.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-indigo-600 flex items-center gap-2">
                    <BookOpen size={18} /> Menjawab Soal
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Setiap kali kamu mendarat di platform level baru, sebuah soal akan muncul. 
                    Pilih jawaban yang benar dari 4 pilihan yang tersedia.
                  </p>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-indigo-600 flex items-center gap-2">
                    <Star size={18} /> Sistem Poin
                  </h3>
                  <ul className="space-y-2 text-slate-600 list-disc list-inside">
                    <li>Jawaban Benar: <strong>+10 Poin</strong></li>
                    <li>Jawaban Salah: <strong>-3 Poin</strong></li>
                    <li>Terjatuh: <strong>-1 Poin</strong></li>
                  </ul>
                </section>
              </div>

              <button
                onClick={() => setView('home')}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
              >
                Mengerti
              </button>
            </motion.div>
          )}

          {view === 'achievements' && (
            <motion.div
              key="achievements"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-4 border-white space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-black text-slate-800">Pencapaian</h2>
              </div>

              <div className="bg-indigo-50 p-6 rounded-2xl border-2 border-indigo-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">Tingkat Saat Ini</p>
                  <p className="text-2xl font-black text-slate-800">{getAchievement(totalScore).name}</p>
                </div>
                <AchievementBadge score={totalScore} size={48} />
              </div>

              <div className="space-y-4">
                {ACHIEVEMENTS.map((ach) => {
                  const isUnlocked = totalScore >= ach.minScore;
                  const Icon = ach.icon;
                  return (
                    <div 
                      key={ach.level}
                      className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                        isUnlocked 
                          ? `${ach.bg} border-current/10 ${ach.color}` 
                          : 'bg-slate-50 border-slate-100 text-slate-300'
                      }`}
                    >
                      <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-inner ${
                        isUnlocked ? 'bg-white/50' : 'bg-slate-100'
                      }`}>
                        <Icon size={32} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-black text-lg">{ach.name}</h3>
                          {!isUnlocked && <Lock size={16} className="opacity-50" />}
                        </div>
                        <p className={`text-xs font-bold ${isUnlocked ? 'opacity-80' : 'opacity-40'}`}>
                          Skor: {ach.minScore}{ach.maxScore === Infinity ? '+' : ` - ${ach.maxScore}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setView('home')}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 transition-all"
              >
                Kembali
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
