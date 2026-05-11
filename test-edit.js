import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const apiKey = process.env.VITE_GEMINI_API_KEY || "AIzaSy..."; 
// we will load it from .env or netlify.toml
