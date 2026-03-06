export type Subject = 'Matematika' | 'Informatika' | 'Bahasa Indonesia' | 'Bahasa Inggris' | 'PKN' | 'Sejarah' | 'Seni Budaya' | 'PKWU';

export interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer: number;
  difficulty: number; // 1 to 10
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  subject: string;
  score: number;
  correct_answers: number;
  first_try_correct: number;
  timestamp: string;
  totalScore?: number; // For class leaderboard
  totalCorrect?: number;
  totalFirstTry?: number;
  count?: number;
}

export interface GameState {
  score: number;
  correctCount: number;
  firstTryCorrectCount: number;
  lastAnsweredLevel: number;
  currentLevel: number;
  timeLeft: number; // in seconds
  isGameOver: boolean;
  subject: Subject | null;
  questions: Question[];
}
