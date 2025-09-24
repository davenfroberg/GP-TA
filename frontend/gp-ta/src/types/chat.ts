// Types
export interface Citation {
  title: string;
  url: string;
  post_number?: string; // Optional post number for better citations
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  course?: string; // Add course to message data for user messages
  citations?: Citation[];
}

export interface ChatTab {
  id: number;
  title: string;
  messages: Message[];
  selectedCourse: string; 
}

export interface ChatConfig {
  prioritizeInstructor: boolean;
  model: string;
}