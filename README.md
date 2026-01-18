# GP-TA (in progress)
*A real-time, retrieval-augmented teaching assistant for UBC's Piazza course forum.*

GP-TA is a RAG platform built to help UBC students get fast, contextually accurate answers based on their course’s Piazza posts. It retrieves relevant discussions, reasons over them, and streams a structured answer back to the client over WebSockets. When the system doesn't have enough Piazza context, it can optionally generate a draft Piazza post to help students ask better questions, or create a semantic notification so they get emailed when relevant posts are created.

## Features

### Semantic Retrieval Over Piazza History
Instead of searching through dozens of posts, students can ask a question in plain language and immediately see answers grounded in the most relevant Piazza discussions. GP-TA pulls in the right threads (optionally prioritizing instructor replies) and shows clear citations and links so students can jump straight to the original post if they want more detail.

### Intelligent Intent Routing
GP-TA automatically figures out what a student is really asking for: a direct answer, a quick topic overview, or a “what’s been happening lately?” summary. This means students don’t have to learn different modes or commands. Instead, the system automatically routes their request to the experience that will be most useful.

### Semantic-Based Notifications
Students can “subscribe” to ideas instead of just threads. For example, “dynamic programming questions” or “exam logistics.” They’ll only get emails when genuinely related posts show up on Piazza, cutting down on notification spam while still surfacing the posts they care about most.

### Post Generation When Context Is Missing
When Piazza doesn’t yet contain an answer, GP-TA tells the student that more information is needed and helps them move forward. GP-TA can draft a clear, courteous Piazza post that captures what the student is stuck on, automatically posting it to Piazza on the student's behalf, making it easier for instructors and TAs to respond quickly and effectively.

### Piazza Activity Summarization
Students who have been away from Piazza for a few days can get a quick, high-level digest instead of scrolling through pages of posts. GP-TA groups recent activity into human-readable topics (like homework, exams, or conceptual questions) so they can see at a glance what’s changed and what might need their attention.


## Design
- Built on a fully serverless AWS stack using Lambda, API Gateway (REST + WebSockets), DynamoDB, Step Functions, SQS, and SES.
- Piazza posts are embedded with OpenAI models and stored in a Pinecone vector database, allowing for efficient semantic vector search over multiple courses.
- A Lambda-based RAG pipeline retrieves context from Pinecone and DynamoDB, builds a strict system prompt, and streams OpenAI responses to the frontend in real time via API Gateway WebSockets.
- Event-driven ingestion using the Gmail API as a makeshift webhook reduces overall Piazza scrape time by only scraping new posts.
- Custom intent engine which predicts user intent using lightweight logistic regression trained on example user queries.
- Sends emails for course announcements and user-subscribed topics using AWS Simple Email Service (SES) and notification Lambdas.
- Clean, modern React + Vite + TypeScript frontend with Tailwind-style utility classes for a responsive, theme-aware UI.
- User authentication via AWS Cognito with support for sign in, sign up, and password reset.


## Example Queries
- “What’s on the midterm?”
- “I'm stuck on problem set 9!”
- “Is the assignment deadline extended?”
- “What does the error ‘shape mismatch’ mean in homework 2?”
- “What libraries can we use for the project?”
- “What’s been happening on Piazza in the last couple of days?”
- “Notify me whenever someone asks about dynamic programming in CPSC 320.”



## Why I Built GP-TA

GP-TA began as a teaching tool. As a TA, I saw too often how students struggled to locate key answers buried in long Piazza threads, and would end up asking redundant questions. A fully semantic, real-time assistant that respects the course’s actual history turned out to be the perfect solution. It helps students learn faster, reduces duplicated questions, and preserves instructor intent by grounding everything in real posts, while still giving them pathways (notifications, post generation, digests) when Piazza doesn’t yet have the answer.
