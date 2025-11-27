// Constants
export const API_KEY = import.meta.env.VITE_GP_TA_API_KEY;
export const API_ID = import.meta.env.VITE_GP_TA_API_ID;
export const WEBSOCKET_URL = `wss://${API_ID}.execute-api.us-west-2.amazonaws.com/production/?api_key=${API_KEY}`;
export const COURSES = ["CPSC 110", "CPSC 121", "CPSC 330", "CPSC 404", "CPSC 418"];
export const MODELS = [
  { value: "gpt-5", label: "GPT-5" },
  { value: "gpt-5-mini", label: "GPT-5-mini" }
];
export const EXAMPLE_PROMPTS = [
  "when is homework 1 due?",
  "summarize the past two days",
  "how do I do question 5 on homework 2?",
  "what topics will be on the midterm?",
  "I missed an iClicker, is this okay?",
  "catch me up please",
  "where are office hours held?",
  "how do I register for quiz 3?",
  "is lecture cancelled today?",
];
export const MAX_NUMBER_OF_TABS = 6;