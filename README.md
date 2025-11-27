# GP-TA (in progress)
*A real-time, retrieval-augmented teaching assistant for UBC's Piazza course forum.*

GP-TA is a RAG platform built to help UBC students get fast, contextually accurate answers based on their course’s Piazza posts. It retrieves relevant discussions, reasons over them, and streams a structured answer back to the client. When the system doesn't have enough context, it can optionally generate a draft Piazza post to help students ask better questions, or create a notification which sends an email whenever relevant posts are created.

## Features

### Semantic Retrieval Over Piazza History
GP-TA embeds all historical Piazza posts and retrieves the most relevant context for each query, with the option to give instructor posts additional weight.

### Semantic-Based Notifications
Students can subscribe to topics and receive alerts only when new posts semantically match their interests, avoiding unnecessary inbox noise.

### Post Generation When Context Is Missing
If GP-TA can’t fully answer a question, it notifies the user and can **draft and post** a clear Piazza post to help them express what they’re asking.

### Piazza Activity Summarization
GP-TA can summarize recent Piazza discussions so students can quickly understand what’s been happening without reading every post.


## Design
- Built on a fully serverless AWS stack using Lambda, API Gateway, DynamoDB, Step Functions, SQS, and SES.
- Piazza posts are embedded with OpenAI models and stored in a Pinecone vector database, allowing for easy semantic vector search.
- A Lambda-based RAG pipeline retrieves context and streams OpenAI LLM responses to the frontend in real time.
- Event-driven ingestion using the Gmail API as a makeshift webhook reduces overall Piazza scrape time, only scraping new posts.
- Predicts user intent using lightweight logistic regression trained on example user queries.
- Sends emails for course announcements and user-subscribed topics using AWS Simple Email Service (SES).
- Clean and easy to use React.js frontend.


## Example Queries
- “What’s on the midterm?”  
- “I'm stuck on problem set 9!”  
- “Is the assignment deadline extended?”  
- “What does the error ‘shape mismatch’ mean in homework 2?”  
- “What libraries can we use for the project?”


## Why I Built GP-TA

GP-TA began as a teaching tool. As a TA, I saw too often how students often struggled to locate key answers buried in long Piazza threads, and would end up asking redundant questions. A fully semantic, real-time assistant that respects the course’s actual history turned out to be the perfect solution. It helps students learn faster, reduces duplicated questions, and preserves instructor intent by grounding everything in real posts.
