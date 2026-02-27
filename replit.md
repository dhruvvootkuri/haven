# Haven - Housing Case Manager

## Overview
A case worker dashboard web application that helps homeless people apply for housing programs based on their eligibility. Features AI-powered browser-based voice intake conversations using browser Speech Recognition for seamless real-time listening and ElevenLabs TTS for agent voice, per-sentence emotion analysis with color-coded live transcripts, LLM-driven dynamic conversations, GLiNER entity extraction, eligibility classification, housing search with multi-dimensional relevance scoring, referral graph visualization, and automated application submission.

## Architecture
- **Frontend**: React + TypeScript with Vite, Shadcn UI, TailwindCSS, wouter routing
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Graph Database**: Neo4j for referral graph visualization
- **Real-time**: WebSocket server for live transcript streaming
- **Voice**: Browser SpeechRecognition (continuous listening) + ElevenLabs TTS (agent voice, browser SpeechSynthesis fallback)

## External Integrations
- **OpenAI** (Replit AI Integration): LLM-powered dynamic conversation engine (gpt-4o) + per-sentence emotion analysis (replaced Modulate)
- **ElevenLabs** (Replit Connector): Natural text-to-speech for agent voice
- **Fastino/Pioneer GLiNER** (`https://api.pioneer.ai/gliner-2`): Entity extraction (`extract_json`, `extract_entities`), relevance classification (`classify_text`), eligibility classification; auth via `x-api-key` header (NOT Bearer)
- **Tavily**: AI-powered housing program search, results scored by Fastino (60% Fastino + 40% Tavily)
- **Neo4j**: Graph database for referral network visualization (PostgreSQL fallback)
- **Yutori**: Automated application submission to housing programs

## Project Structure
```
client/src/
  pages/           - Dashboard, Clients, NewClient, ClientDetail, ReferralGraph, PioneerModels
  components/      - AppSidebar, ThemeToggle, LiveTranscript, VoiceChat, UI components
  hooks/           - useTheme, useToast, useMobile
server/
  index.ts         - Express server entry
  routes.ts        - All API endpoints + browser voice call endpoints
  storage.ts       - Database CRUD operations
  db.ts            - PostgreSQL connection
  seed.ts          - Sample data seeding
  websocket.ts     - WebSocket server for real-time transcript streaming
  call-state.ts    - In-memory active call state management
  services/
    elevenlabs.ts  - ElevenLabs TTS via Replit connector
    llm-conversation.ts - OpenAI-powered dynamic conversation engine
    tavily.ts      - Housing program search + Fastino relevance scoring
    modulate.ts    - Per-sentence emotion analysis (OpenAI gpt-4o)
    fastino.ts     - GLiNER entity extraction, relevance classification, eligibility classification
    neo4j.ts       - Graph database operations
    yutori.ts      - Auto-application submission
shared/
  schema.ts        - Drizzle schemas: clients, calls, housingPrograms, eligibilityAssessments, applications, conversations, messages
```

## Key Data Flow
1. Caseworker creates client profile and clicks "Start Call" on the client detail page
2. Server generates LLM greeting, browser speaks it via ElevenLabs TTS (SpeechSynthesis fallback)
3. Browser continuously listens via SpeechRecognition — no clicking required
4. When user finishes speaking, recognized text is sent to server automatically
5. Server splits text into sentences, analyzes each sentence's emotion individually via OpenAI
6. OpenAI generates the next contextual intake question
7. Browser speaks agent response; transcript + per-sentence emotion data pushed via WebSocket
8. Frontend renders live transcript with per-sentence color-coded emotion badges
9. Audio waveform visualization shows real-time mic input on canvas
10. On call completion, LLM summarizes call and Fastino extracts structured entities
11. Tavily searches for relevant housing programs, scored by Fastino GLiNER relevance
12. Fastino classifies eligibility per program with multi-factor analysis
13. Caseworker can click "Apply" to auto-submit via Yutori
14. Everything is mapped in Neo4j as a referral graph

## Browser Voice Call API
- `POST /api/clients/:id/call` - Start a voice call, returns { ...call, greetingText }
- `POST /api/calls/:callId/voice-turn` - Send JSON { text }, returns { agentText, sentenceEmotions[], isComplete }
- `POST /api/calls/:callId/end` - End the call, triggers finalization

## Fastino/Pioneer API
- Base endpoint: `https://api.pioneer.ai/gliner-2` (base GLiNER-2 model)
- Fine-tuned endpoint: `https://api.pioneer.ai/inference` (custom trained models, requires `model_id`)
- Auth: `x-api-key` header with FASTINO_API_KEY
- Operations: `extract_json` (structured data), `extract_entities` (NER), `classify_text` (with `categories` key)
- Entity extraction: housing_need, location_preference, health_condition, employment_detail, family_situation, document_type, urgency_indicator, service_need
- Multi-dimensional relevance: overall, location, urgency, services dimensions
- Eligibility: housing_type, income_requirement, demographic, location_match, documentation categories
- **Model Vibetuning**: Upload NER/classification training datasets → Train custom model → Deploy → Switch inference to custom model via `/inference`
- Training API: `/felix/datasets/upload/url` → S3 upload → `/felix/datasets/upload/process` → `/felix/training-jobs` (POST to start, GET for status)
- NER dataset format: JSONL with `{ text, entities: [[span_text, label], ...] }`
- Dataset reference for training: `{ name: "dataset-name" }` (by name, not by ID)

## Additional API Endpoints
- `POST /api/clients/:id/extract-entities` - Extract GLiNER entities from call transcripts
- `POST /api/housing/:programId/analyze` - Multi-dimensional Fastino relevance analysis
- `POST /api/clients/:id/search-housing` - Search + score housing programs
- `POST /api/clients/:id/run-pipeline` - Full pipeline: search → score → eligibility
- `POST /api/tts` - ElevenLabs text-to-speech
- `GET /api/pioneer/datasets` - List Pioneer datasets
- `POST /api/pioneer/datasets/create-ner` - Create NER training dataset
- `POST /api/pioneer/datasets/create-classification` - Create classification training dataset
- `GET /api/pioneer/training-jobs` - List training jobs
- `POST /api/pioneer/training-jobs` - Start training { datasetName, modelName }
- `GET /api/pioneer/training-jobs/:jobId` - Get training job status
- `POST /api/pioneer/active-model` - Set active model { modelId }
- `GET /api/pioneer/active-model` - Get current active model

## Per-Sentence Emotion Analysis
Each caller utterance is split by sentence. Every sentence gets its own emotion classification:
- Server splits on `.!?` punctuation, analyzes each sentence via OpenAI gpt-4o
- Returns `sentenceEmotions` array: `[{ text, emotion, confidence }]`
- Frontend displays each sentence with its own color dot and emotion badge
- Emotions: anxiety=purple, sadness=blue, frustration=red, hope=green, urgency=orange, gratitude=teal, neutral=gray

## Real-time Transcript System
- **WebSocket path**: `/ws/transcript` (query params: callId, clientId)
- **Call finalization**: LLM summarizes the call, Fastino extracts entities, auto-updates client profile

## Environment Variables
- DATABASE_URL (PostgreSQL - auto-managed)
- AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL (Replit AI)
- TAVILY_API_KEY, FASTINO_API_KEY, YUTORI_API_KEY
- NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
- SESSION_SECRET
