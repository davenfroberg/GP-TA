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
  citationMap?: Record<string, Citation>; // Maps post numbers (as strings) to citation objects, e.g., "123" -> citation
  needsMoreContext?: boolean;
  notificationCreated?: boolean;
  notificationLoading?: boolean;
  isLoading?: boolean;
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

export interface Notification {
  id: string;
  query: string;
  course_name: string;
}
