import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const db = new Database("leaderboard.db");

  // Initialize database
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_code TEXT,
      subject TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      first_try_correct INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add missing columns if they don't exist
  const tableInfo = db.prepare("PRAGMA table_info(leaderboard)").all() as any[];
  const columns = tableInfo.map(col => col.name);
  
  if (!columns.includes('first_try_correct')) {
    db.exec("ALTER TABLE leaderboard ADD COLUMN first_try_correct INTEGER DEFAULT 0");
  }
  if (!columns.includes('correct_answers')) {
    db.exec("ALTER TABLE leaderboard ADD COLUMN correct_answers INTEGER DEFAULT 0");
  }
  if (!columns.includes('class_code')) {
    db.exec("ALTER TABLE leaderboard ADD COLUMN class_code TEXT");
  }

  app.use(express.json());

  // API Routes
  
  // Get total score for a specific user
  app.get("/api/user/:name/total-score", (req, res) => {
    const { name } = req.params;
    const stmt = db.prepare("SELECT SUM(score) as totalScore FROM leaderboard WHERE name = ?");
    const result = stmt.get(name) as { totalScore: number | null };
    res.json({ totalScore: result.totalScore || 0 });
  });

  // Leaderboard 1: Ranking of subjects for a specific user
  app.get("/api/leaderboard/user/:name/subjects", (req, res) => {
    const { name } = req.params;
    const stmt = db.prepare("SELECT subject, score, correct_answers, first_try_correct FROM leaderboard WHERE name = ? ORDER BY score DESC");
    const rows = stmt.all(name);
    res.json(rows);
  });

  // Leaderboard 2: Ranking of students in a specific class code (by total score)
  app.get("/api/leaderboard/class/:classCode", (req, res) => {
    const { classCode } = req.params;
    const stmt = db.prepare(`
      SELECT name, SUM(score) as totalScore, SUM(correct_answers) as totalCorrect, SUM(first_try_correct) as totalFirstTry
      FROM leaderboard 
      WHERE class_code = ? 
      GROUP BY name 
      ORDER BY totalScore DESC 
      LIMIT 50
    `);
    const rows = stmt.all(classCode);
    res.json(rows);
  });

  app.get("/api/leaderboard/global", (req, res) => {
    const stmt = db.prepare("SELECT * FROM leaderboard ORDER BY score DESC LIMIT 20");
    const rows = stmt.all();
    res.json(rows);
  });

  app.post("/api/leaderboard", (req, res) => {
    const { name, class_code, subject, score, correct_answers, first_try_correct } = req.body;
    if (!name || !subject || score === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Check if user already has a score for this subject
    const existing = db.prepare("SELECT id, score, correct_answers, first_try_correct FROM leaderboard WHERE name = ? AND subject = ?").get(name, subject) as { id: number, score: number, correct_answers: number, first_try_correct: number } | undefined;
    
    if (existing) {
      // Update existing record
      const newScore = existing.score + score;
      const newCorrect = existing.correct_answers + correct_answers;
      const newFirstTry = (existing.first_try_correct || 0) + (first_try_correct || 0);
      const stmt = db.prepare("UPDATE leaderboard SET score = ?, correct_answers = ?, first_try_correct = ?, class_code = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?");
      stmt.run(newScore, newCorrect, newFirstTry, class_code, existing.id);
    } else {
      // Insert new record
      const stmt = db.prepare("INSERT INTO leaderboard (name, class_code, subject, score, correct_answers, first_try_correct) VALUES (?, ?, ?, ?, ?, ?)");
      stmt.run(name, class_code, subject, score, correct_answers, first_try_correct || 0);
    }
    
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
