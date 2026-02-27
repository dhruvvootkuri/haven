# Haven: AI-Powered Housing & Referral Intelligence

Haven is a mission-critical platform designed to bridge the gap between vulnerable populations and essential housing services. By leveraging advanced AI voice interactions, real-time emotion analysis, and graph-based referral intelligence, Haven transforms the intake and placement process for social services.

## 🌟 Key Features

### 🎙️ AI Voice Intake & Transcription
- **Natural Interaction**: Real-time voice-to-text intake using high-fidelity transcription.
- **Dynamic Response**: LLM-powered conversational agents that guide users through complex intake forms naturally.
- **Automated Summarization**: Automatically extracts critical data points (income, dependents, veteran status) from spoken conversations.

### 🎭 Real-time Emotion & Sentiment Analysis
- **Affective Computing**: Detects user emotions (anger, fear, sadness, etc.) and overall sentiment during calls.
- **Urgency Detection**: Uses emotional context and keyword extraction to prioritize high-risk clients.
- **Emotion Profiles**: Maintains a historical emotional profile for each client to track well-being over time.

### 🔍 Context-Aware Housing & Program Search
- **Tavily Integration**: Leverages AI-native search to find the most relevant and up-to-date housing programs based on client specific needs.
- **Multi-dimensional Relevance**: Classifies program relevance using LLM analysis of transcript context vs. program requirements.

### 📋 Automated Eligibility & Application
- **Fastino Eligibility Grading**: Instant classification of program eligibility based on client attributes and program rules.
- **Yutori Integration**: Automates the submission of applications to external provider APIs or web portals.

### 🕸️ Referral Network Graph
- **Neo4j Visualization**: A complex relational graph showing the connections between clients, calls, housing programs, and successful placements.
- **React Flow Interface**: Interactive dashboard to explore client journeys and program efficacy.

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS & Shadcn UI
- **State/Data**: TanStack Query (React Query), Wouter (Routing)
- **Visualization**: React Flow, Recharts, Framer Motion

### Backend
- **Server**: Express.js with TypeScript
- **Real-time**: WebSockets for live transcript and call event broadcasting.
- **Database**: 
  - **PostgreSQL**: Primary transactional storage via **Drizzle ORM**.
  - **Neo4j**: Graph database for tracking complex referral relationships.

### AI & Services
- **LLM**: OpenAI (GPT-4o)
- **Search**: Tavily (AI-powered housing search)
- **Voice**: ElevenLabs (TTS), Twilio (Voice Infrastructure)
- **Intelligence**: Fastino (Entity extraction & classification), Modulate (Emotion analysis)

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- PostgreSQL instance
- Neo4j instance
- API Keys for: OpenAI, ElevenLabs, Twilio, Tavily, Fastino, Modulate.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd haven
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file in the root and provide the necessary credentials:
   ```env
   DATABASE_URL=postgresql://...
   NEO4J_URI=bolt://...
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=...
   OPENAI_API_KEY=...
   ELEVENLABS_API_KEY=...
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TAVILY_API_KEY=...
   MODULATE_API_KEY=...
   FASTINO_API_KEY=...
   ```

4. **Database Setup**:
   ```bash
   npm run db:push
   ```

5. **Run the application**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5000`.

## 📁 Architecture

- `client/`: React frontend application
- `server/`: Express backend, API routes, and service integrations
- `shared/`: Shared TypeScript schemas and types (Zod + Drizzle)
- `script/`: Build scripts and database utilities

## 📄 License
MIT
