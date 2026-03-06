import { GoogleGenAI, Type } from "@google/genai";
import { Question, Subject } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateQuestions(subject: Subject, customTopic?: string): Promise<Question[]> {
  const prompt = `Buatlah 10 pertanyaan pilihan ganda untuk mata pelajaran sekolah: ${subject}. 
  ${customTopic ? `Topik spesifik yang harus dibahas: ${customTopic}.` : ''}
  Pertanyaan harus memiliki tingkat kesulitan yang meningkat dari 1 (mudah) sampai 10 (sulit).
  Setiap pertanyaan harus memiliki tepat 4 pilihan jawaban dan satu indeks jawaban yang benar (0-3).
  Gunakan Bahasa Indonesia yang baik dan benar.
  Kembalikan hasilnya sebagai array objek JSON dengan struktur berikut:
  {
    "id": number,
    "text": string,
    "options": string[],
    "correctAnswer": number,
    "difficulty": number
  }`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            text: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            correctAnswer: { type: Type.INTEGER },
            difficulty: { type: Type.INTEGER }
          },
          required: ["id", "text", "options", "correctAnswer", "difficulty"]
        }
      }
    }
  });

  try {
    const questions = JSON.parse(response.text || "[]");
    return questions;
  } catch (e) {
    console.error("Failed to parse questions", e);
    return [];
  }
}

export async function generateKisiKisi(subject: Subject, customTopic: string): Promise<string> {
  const prompt = `Buatlah kisi-kisi umum yang SANGAT RINGKAS dan PADAT untuk mata pelajaran ${subject} dengan topik: ${customTopic}. 
  Berikan dalam bentuk poin-poin utama saja (maksimal 5-7 poin).
  Jangan gunakan pembagian per level, cukup ringkasan materi secara keseluruhan.
  Jangan berikan penjelasan panjang.
  Gunakan Bahasa Indonesia.
  Format: Markdown.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text || "Gagal menghasilkan kisi-kisi.";
}
