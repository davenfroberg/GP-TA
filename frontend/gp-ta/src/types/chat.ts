// Types
export interface Citation {
  title: string;
  url: string;
  post_number?: string;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  course?: string; 
  citations?: Citation[];
  needsMoreContext?: boolean;
  notificationCreated?: boolean;
  notificationLoading?: boolean;
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