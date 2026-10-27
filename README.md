<p align="center">
  <img src="Client/public/icons/hero-banner.png" alt="MIRA — Memory, Intelligence, Recall, Assistant" width="100%" />
</p>

<p align="center">
  <img src="Client/public/icons/favicon-96x96.png" alt="MIRA Logo" width="64" height="64" />
</p>

<h1 align="center">MIRA</h1>
<p align="center"><strong>Memory • Intelligence • Recall • Assistant</strong></p>

<p align="center">
  <em>An autonomous, context-aware AI assistant and personal digital memory that anticipates your needs, organizes your day, and keeps your private data strictly on your device.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20x64-0078D6?style=flat-square&logo=windows&logoColor=white" alt="Windows Platform" />
  <img src="https://img.shields.io/badge/Desktop%20Framework-Tauri%20v2-FFC131?style=flat-square&logo=tauri&logoColor=black" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%20%2B%20Tailwind-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite%20%2B%20Redis-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI Backend" />
  <img src="https://img.shields.io/badge/Operator-Native%20Rust%20Engine-DEA584?style=flat-square&logo=rust&logoColor=black" alt="Rust Native Operator" />
</p>

---

**Project Type:** Personal AI Knowledge Base · Context-Aware AI Assistant · Proactive Personal Agent

**Core Vision:** Build a personal AI assistant that remembers a user's digital life, understands their interests and goals, anticipates their needs, and prepares useful information and actions before they are requested.

**Core Principle:** Your personal knowledge stays on your device. Cloud AI receives only the relevant context needed to perform a specific task.

---

# 1. What Is MIRA?

MIRA is a personal AI assistant that builds a detailed knowledge base of a user's digital life and uses that knowledge to provide personalized, proactive assistance.

It captures and stores permitted information about the user's activities, interests, learning, projects, preferences, and plans locally. When the user asks a question or needs assistance, MIRA retrieves the relevant information and selectively sends the necessary context to cloud AI models for reasoning, summarization, planning, and natural-language responses.

But MIRA is not just a system that waits for instructions.

It should also anticipate recurring needs and prepare useful information in advance.

For example, if a user regularly reads news at 10 AM, MIRA can prepare a personalized news summary before that time. If the user is learning AI, MIRA can find relevant learning resources for the next day. If the user is looking for a job, MIRA can search for suitable opportunities and prepare a shortlist. If the user enjoys music, MIRA can prepare recommendations based on their preferences.

MIRA can also help organize the user's day, suggest weekend plans, recall past activities, resume unfinished work, and perform authorized computer tasks.

The objective is to create an assistant that understands the user's context and helps them manage their digital life with less effort.

**In simple terms: MIRA remembers your digital life, understands what matters to you, and prepares what you need next.**

# 2. The Problem MIRA Solves

People interact with enormous amounts of information every day. They learn new things, work on projects, explore opportunities, consume content, and manage personal responsibilities.

However, this information is scattered across different applications, websites, documents, and services.

At the same time, most digital tools wait for the user to initiate every action.

Users must remember what they were doing, search for relevant information, find suitable resources, plan their schedules, and repeatedly perform the same research.

MIRA aims to reduce this burden.

## 2.1 Fragmented personal information

A user's digital knowledge is spread across browsers, videos, documents, code editors, emails, notes, and applications.

MIRA brings relevant information together in a locally stored personal knowledge base.

## 2.2 Forgetting useful information

Users often forget where they learned something, which file contains an important detail, or what they were working on previously.

MIRA makes that information searchable through natural-language questions.

## 2.3 Repeated research

Users repeatedly search for jobs, learning resources, news, tools, and other information that matches their interests.

MIRA can use previously established preferences to perform this research proactively and prepare relevant results.

## 2.4 Daily planning overhead

Planning a productive day requires reviewing pending tasks, identifying priorities, checking opportunities, and deciding what to do next.

MIRA can prepare a daily plan using the user's goals, recent activity, preferences, and upcoming commitments.

## 2.5 Reactive AI assistants

Traditional assistants generally wait for a prompt.

MIRA is intended to work in two modes:

- **Reactive assistance:** Answer questions and perform tasks when the user asks.
- **Proactive assistance:** Prepare relevant information, reminders, recommendations, and plans based on user-defined preferences and schedules.

## 2.6 Privacy concerns

A comprehensive personal knowledge base can contain sensitive information.

MIRA addresses this through local storage, selective data sharing with cloud models, user-controlled permissions, and transparent handling of personal information.

# 3. The Four Pillars of MIRA

## Memory

Capture and retain useful information about the user's digital activities, interests, projects, and preferences.

## Intelligence

Use AI to understand requests, summarize information, connect relevant memories, and reason about the user's needs.

## Recall

Allow users to retrieve past activities, information, decisions, files, and learning resources through natural conversation.

## Assistant

Help users plan their days, discover opportunities, prepare useful information, and execute supported tasks.

Together, these capabilities create a persistent and proactive personal assistant.

# 4. Personal Knowledge Base

The personal knowledge base is the foundation of MIRA.

It should maintain a detailed, searchable history of the user's digital life, subject to the user's permissions and retention settings.

Possible information sources include:

- Browser history and selected web content.
- Videos watched and learning resources explored.
- Applications used and relevant work activities.
- Documents, notes, and files.
- Projects and technical decisions.
- Selected emails and messages through authorized integrations.
- Tasks started, completed, or left unfinished.
- User-defined interests, goals, and preferences.
- Previous plans and recommendations.

MIRA should not simply collect raw information. It should organize it into useful records that can be searched and connected.

For example, a user watches a tutorial about vector databases, reads documentation about embeddings, and implements semantic search in a project.

MIRA can retain the relevant activity records and associate them with the same topic or project.

Later, the user can ask:

"What did I learn about embeddings, and how did I use them in my project?"

MIRA retrieves the relevant records and sends only the necessary information to the cloud AI model to produce a contextual answer.

## Local memory principle

The personal knowledge base is stored locally on the user's device.

Cloud AI models do not need direct access to the entire knowledge base. MIRA's local retrieval system selects the relevant information for each request.

This separation is central to the architecture.

# 5. Local Storage and Cloud AI Architecture

<p align="center">
  <img src="Client/public/icons/features-banner.png" alt="MIRA Microservices and System Architecture" width="100%" />
</p>

MIRA will use a hybrid architecture rather than requiring every AI model to run locally.

**Local components handle personal data capture, storage, indexing, retrieval, and privacy controls. Cloud models handle language intelligence and voice processing.**

<box border radius="xl" padding={4} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} gap={1}>
    <title size="lg">1. User's Device</title>
    <text color="secondary" size="sm">Private personal data layer</text>
    - Capture permitted activities
    - Store the knowledge base locally
    - Index and search personal memories
    - Maintain preferences, tasks, and schedules
    - Select relevant context for each request
  </box>
  <box align="center" gap={1}>
    <icon name="arrow-down-up" size="xl" />
    <text weight="medium" textAlign="center">Minimal, relevant context only</text>
    <text color="secondary" size="sm" textAlign="center">Selected data is sent for a specific AI task</text>
  </box>
  <box background="surface" border radius="lg" padding={3} gap={1}>
    <title size="lg">2. Cloud AI Services</title>
    <text color="secondary" size="sm">Intelligence and voice layer</text>
    - Language model for reasoning and responses
    - Speech recognition for voice input
    - Text-to-speech for spoken responses
    - Summarization, planning, and recommendations
  </box>
  <box align="center" gap={1}>
    <icon name="arrow-down" size="xl" />
    <text weight="medium">Answer or structured action request</text>
  </box>
  <box background="surface-secondary" radius="lg" padding={3} gap={1}>
    <title size="lg">3. Local Assistant</title>
    - Apply permission and safety checks
    - Save approved results locally
    - Update tasks and plans
    - Present the answer through text or voice
    - Execute authorized computer actions
  </box>
</box>

## 5.1 What stays local?

The default design keeps the following on the user's device:

- Captured activity records.
- Personal documents and local files.
- Search indexes and embeddings.
- Detailed activity history.
- Personal memory records.
- User preferences and long-term goals.
- Daily plans and task history.
- Locally generated activity summaries, where applicable.

## 5.2 What is sent to cloud AI?

Only the information required for a particular operation should be selected.

Examples:

- A question about yesterday's work sends relevant activity summaries, not the complete activity history.
- A request to draft an email sends the necessary project context, not unrelated personal memories.
- A request for a study plan sends relevant learning goals and progress.
- A voice command sends the audio to the selected speech service if cloud transcription is used.
- A request to summarize news sends the selected news articles or extracted text to the model.

The exact data depends on the task.

## 5.3 Context minimization

Before sending information to a cloud model, MIRA should:

1. Identify what the user is asking.
2. Retrieve relevant records locally.
3. Remove unrelated information.
4. Include only the details needed for the task.
5. Exclude or redact sensitive information when possible.
6. Send the minimized context to the selected service.
7. Process the response and store any desired result locally.

For example, if MIRA needs to recommend AI engineering jobs, it may need the user's skills, experience level, location preferences, and desired role. It does not need their complete browsing history or private conversations.

**Important:** Sending less information reduces exposure, but does not guarantee privacy by itself. Cloud providers may have different retention and data-processing policies. MIRA should select providers carefully, minimize logs, and disclose what is sent.

# 6. Proactive Personal Assistant

Proactive assistance is one of MIRA's most important capabilities.

Instead of waiting for users to ask for the same information repeatedly, MIRA should prepare useful results based on their preferences, schedules, goals, and recent activity.

The user should be able to define what MIRA does, when it does it, and how it delivers the result.

## 6.1 Personalized daily planning

MIRA can prepare a daily plan using:

- Pending tasks.
- Recent work and unfinished activities.
- Long-term goals.
- Upcoming deadlines and calendar events, when authorized.
- Learning priorities.
- Recurring routines.
- Time available for the day.
- User preferences.

For example, a user might say:

"Every morning, prepare my plan based on my current projects, pending tasks, and learning goals."

MIRA can review the relevant local records, identify priorities, and prepare a schedule with recommended activities.

A daily plan could include:

- High-priority work.
- Tasks that need follow-up.
- Learning sessions.
- Relevant opportunities.
- Scheduled personal routines.
- Suggested breaks and free time.

The user can review and modify the plan. MIRA should not silently make commitments on the user's behalf.

## 6.2 Scheduled news briefing

Suppose the user likes reading news every day at 10 AM.

MIRA can learn or save this preference and create a recurring workflow.

**Before 10 AM:**

1. Retrieve the user's preferred news categories.
2. Search permitted news sources for current developments.
3. Identify important stories and remove duplicates.
4. Rank stories by relevance and significance.
5. Generate concise summaries with source links.
6. Save the briefing locally.
7. Deliver it at the scheduled time through the chosen interface.

The briefing could cover AI, technology, business, national news, or other topics selected by the user.

MIRA can also personalize the briefing based on topics the user follows.

For example, someone building AI products may receive more coverage of AI research, model releases, developer tools, and industry developments.

The user could ask MIRA to read the briefing aloud or explain a particular story.

Fresh news requires internet access and suitable information sources. Cloud AI can summarize the selected information, while the results can be stored locally.

## 6.3 Job discovery and career assistance

If the user is looking for a job, MIRA can proactively find opportunities matching their preferences.

The user can specify:

- Target roles.
- Skills and experience.
- Preferred locations or remote-work options.
- Salary expectations, if desired.
- Company preferences.
- Industries of interest.
- Other job requirements.

MIRA can periodically search relevant job boards and company career pages, identify matching opportunities, remove duplicates, and prepare a shortlist.

For each opportunity, it can provide:

- Job title and company.
- Location and work arrangement.
- Key requirements.
- Why it matches the user's profile.
- Missing or weakly matched qualifications.
- Application deadline, when available.
- Original job posting link.

For example:

"Every evening, find new AI engineering jobs that match my skills and prepare a shortlist for tomorrow."

MIRA can perform the research in advance so the user does not need to start from scratch each day.

It should prioritize fresh, verifiable listings and clearly identify opportunities that have not been independently confirmed. Applying for a job or sending personal information should require user approval.

## 6.4 Learning-resource discovery

MIRA can help users make progress toward learning goals.

Suppose the user is learning LLMs, voice AI, or software engineering.

MIRA can use the user's stated goals and relevant learning history to:

- Identify topics the user has already studied.
- Find gaps in their understanding.
- Search for useful tutorials, documentation, courses, and videos.
- Rank resources by relevance and quality.
- Prepare a learning plan for the next day.
- Save selected resources for later.
- Suggest practical exercises or projects.

Example:

"Prepare tomorrow's study material based on my progress in LLMs."

MIRA could identify the last topic studied, find the next logical topic, select suitable resources, and prepare a short study schedule.

It should distinguish between resources it has verified and those that are merely promising search results.

## 6.5 Personalized music

MIRA can support music discovery and recurring listening routines.

It could use user-defined preferences and authorized listening history to:

- Recommend music based on preferred genres or moods.
- Prepare playlists for studying, working, relaxing, or exercising.
- Find music related to the user's current activity.
- Suggest new artists and songs.
- Prepare a morning or evening listening routine.

For example:

"Every morning, prepare a playlist for my commute."

MIRA can prepare recommendations or a playlist through supported music services. Actual playback and playlist modification depend on the integrations and permissions available.

## 6.6 Weekend planning

MIRA can prepare personalized weekend plans based on the user's interests, budget, available time, and preferences.

Potential activities include:

- Places to visit.
- Restaurants and cafes.
- Events and activities.
- Outdoor activities.
- Learning projects.
- Movies and entertainment.
- Personal errands.
- Time for rest and hobbies.

Example:

"Every Friday evening, prepare a weekend plan for me."

MIRA can research relevant options, check available information, organize a schedule, and present a few alternatives.

If location access is not enabled, it can ask for a preferred area or use a location the user has explicitly provided.

Bookings and purchases should require user approval.

## 6.7 Reminders and recurring routines

MIRA can support routines such as:

- Daily news at 10 AM.
- A morning plan.
- A daily learning session.
- A weekly project review.
- A Friday weekend briefing.
- A recurring job search.
- A reminder to resume unfinished work.

Each routine should have a clear schedule, data sources, preferences, and delivery method.

The system should avoid unnecessary notifications and allow users to pause, modify, or delete recurring routines.

## 6.8 Proactive recommendations

MIRA can also suggest useful next steps based on the user's activities.

For example:

- A project has been inactive for several days.
- A learning goal has not progressed recently.
- A relevant new tool has been released.
- A deadline is approaching.
- A previously started task remains unfinished.
- A new opportunity matches the user's preferences.

These recommendations should be based on evidence and user-defined goals rather than assumptions about what the user should do.

MIRA should avoid becoming intrusive. Users must control which proactive behaviors are enabled and how often MIRA contacts them.

# 7. Recall and Context-Aware Assistance

Proactive features do not replace MIRA's memory and recall capabilities.

The user should still be able to ask questions about their digital history.

Examples:

- "What did I work on yesterday?"
- "Which video was I watching about embeddings?"
- "Where did I save that file?"
- "What did I decide about my project architecture?"
- "Which job opportunities did you find last week?"
- "What learning resources have I already completed?"
- "Where did I stop in this project?"

MIRA retrieves the relevant records locally and sends only the necessary context to the cloud model when language reasoning or summarization is needed.

For simple operations, such as filtering records by date or searching exact filenames, MIRA should use deterministic local code rather than unnecessarily calling a language model.

Answers should include source references when available, especially for activity history, job listings, news, and other information that needs verification.

# 8. Project Understanding and Task Continuity

MIRA should maintain contextual information about ongoing projects.

For each project, it can track:

- Purpose and goals.
- Relevant files and resources.
- Technical decisions.
- Completed milestones.
- Pending tasks.
- Known problems and blockers.
- Recent activities.
- Suggested next steps.

When the user returns to a project after several days, they can ask:

"Where did I leave off?"

MIRA retrieves relevant activity records and project notes, then prepares a concise status summary.

It can also identify potential next steps and recommend resources that would help complete the project.

This capability should connect with daily planning so that important unfinished work can be considered when preparing the next day's schedule.

# 9. Computer Task Execution

MIRA should eventually be able to execute supported computer operations using its understanding of the user's context.

Examples include:

- Finding and opening files.
- Organizing documents.
- Copying assets into a project directory.
- Creating notes and task records.
- Preparing reports.
- Opening relevant applications and URLs.
- Saving selected learning resources.
- Preparing files for a video editing workflow.

For example:

"Find the songs I downloaded for my latest video and copy them into the project's audio folder."

MIRA should identify the correct project and files, validate the destination, and execute the copy operation through a controlled local action layer.

Cloud AI can help interpret the request and choose an appropriate action. The actual filesystem operation should run locally, under restricted permissions.

The language model should not have unrestricted access to the user's computer.

Actions that are destructive, externally visible, or otherwise sensitive should require confirmation as appropriate.

# 10. Voice Interaction

MIRA should support natural voice conversations.

Users can speak questions, request summaries, ask for recommendations, and initiate supported tasks.

For example:

- "Hey MIRA, what is my plan for today?"
- "Read me today's top news."
- "Find new jobs matching my profile."
- "What should I study tomorrow?"
- "Help me continue my last project."

In the proposed architecture, cloud AI services handle speech recognition and text-to-speech, alongside the cloud language model.

A typical interaction works as follows:

1. The user speaks.
2. Audio is sent to the configured cloud speech recognition service.
3. MIRA receives the transcribed request.
4. Local code retrieves relevant personal context.
5. Only the necessary context is sent to the cloud language model.
6. The response or proposed action returns to MIRA.
7. The application validates and executes any permitted action.
8. The response is delivered through cloud text-to-speech or displayed as text.

The system should minimize audio and transcript retention where supported by the selected providers.

Voice data may itself contain sensitive information. It should be treated as a separate data-sharing category, with clear disclosure and user controls.

# 11. Technical Architecture

MIRA should be implemented as a set of cooperating components.

## 11.1 Activity capture service

Captures permitted information from supported sources.

Responsibilities:

- Monitor selected activity sources.
- Extract relevant content and metadata.
- Record timestamps and source information.
- Respect application exclusions and permissions.
- Save captured records locally.

## 11.2 Local storage layer

Stores the user's personal knowledge base.

A practical implementation could use:

- SQLite for structured records.
- Filesystem storage for permitted local content.
- A full-text search index.
- A vector index for semantic retrieval.
- Local configuration and preference storage.

The storage layer should support backup, retention policies, and user-controlled deletion.

## 11.3 Local indexing and retrieval

Creates searchable indexes and retrieves the relevant information for each request.

Responsibilities include:

- Keyword search.
- Semantic search.
- Time-based filtering.
- Source and application filtering.
- Project-based retrieval.
- Deduplication.
- Context ranking.

Local embedding models may be used to generate vectors without sending the underlying text to an embedding API.

## 11.4 Context preparation and privacy gateway

This is a critical component of MIRA.

Before information is sent to a cloud model, this layer determines what the model actually needs.

Responsibilities include:

- Identifying the purpose of each request.
- Retrieving relevant records.
- Removing unrelated context.
- Redacting sensitive information when appropriate.
- Enforcing data-sharing rules.
- Selecting the appropriate cloud service.
- Recording permitted metadata about external calls.

This layer should be independent of the language model so that the model cannot bypass local access controls.

## 11.5 Cloud intelligence layer

Uses external AI APIs for tasks such as:

- Natural-language understanding.
- Complex reasoning.
- Summarization.
- Daily planning.
- Job and resource evaluation.
- Recommendation generation.
- Structured action planning.

The cloud model receives a task-specific context rather than unrestricted access to local memory.

## 11.6 Cloud speech layer

Handles voice processing through supported speech-to-text and text-to-speech services.

The specific provider can be selected based on accuracy, latency, language support, pricing, and data policies.

## 11.7 Proactive scheduler

Runs scheduled workflows and prepares information before it is needed.

Responsibilities include:

- Maintaining recurring schedules.
- Triggering job searches and news briefings.
- Preparing daily plans.
- Finding learning resources.
- Generating weekend recommendations.
- Managing retries and failures.
- Delivering results through the chosen interface.

The scheduler should run reliably in the background. If the device is asleep or offline, it should handle missed runs according to the user's preferences.

## 11.8 Tool execution layer

Executes permitted actions through local code and authorized integrations.

It should validate inputs, enforce permissions, and maintain an audit trail of actions taken.

## 11.9 User interface

Provides:

- Voice and text interaction.
- Searchable personal memories.
- Activity history.
- Project summaries.
- Daily plans.
- Proactive briefings.
- Saved jobs and learning resources.
- Scheduled routines.
- Data-sharing controls.
- Memory management.
- Action history.

# 12. Suggested Technology Stack

The final stack should be selected based on the target operating system and required integrations.

| Component | Possible technology |
|---|---|
| Desktop application | Electron or Tauri |
| Local backend | Node.js or Python |
| Structured local database | SQLite |
| Full-text search | SQLite FTS5 |
| Semantic retrieval | Local embeddings and a vector index |
| Cloud language models | Selected LLM APIs |
| Speech-to-text | Cloud speech API |
| Text-to-speech | Cloud TTS API |
| Background workflows | Local scheduler and task queue |
| Web research | Search APIs and supported integrations |
| Computer automation | Restricted local tools |
| Data protection | OS permissions, encryption, and access controls |

This is a proposed stack, not a requirement to use every technology listed.

# 13. Data Security and Privacy Principles

MIRA's usefulness depends on users trusting it with their personal information.

Its design should follow these principles:

**Local by default:** Personal activity records remain on the user's device.

**Minimal disclosure:** Cloud models receive only task-relevant information.

**User control:** Users decide what is captured, stored, shared, and deleted.

**Purpose limitation:** Information retrieved for one task should not automatically be shared with unrelated services.

**Transparency:** Users can inspect which external services are used and what categories of information are sent.

**Retention control:** Activity history, audio, and generated summaries should have configurable retention policies.

**Secure execution:** Local actions must be validated and permission-controlled.

**Evidence-based recall:** MIRA should distinguish recorded facts from AI-generated interpretations.

**Provider awareness:** Cloud services must be evaluated for retention, training, and data-handling policies.

Local storage reduces the amount of personal information exposed to cloud services, but does not eliminate all privacy risks. Device security, integrations, cloud-provider practices, and the data sent in individual requests still matter.

# 14. Development Roadmap

The full vision is ambitious. MIRA should be built incrementally.

## Phase 1 — Personal Knowledge Base

- Build the local database.
- Import selected files, notes, and documents.
- Implement text extraction and indexing.
- Add keyword and semantic search.
- Connect a cloud language model.
- Retrieve relevant context locally before each model request.
- Answer questions with supporting references.

**Outcome:** MIRA can answer questions about a local collection of personal information without uploading the entire collection.

## Phase 2 — Activity Capture

- Capture supported browser and application activity.
- Store timestamps and source metadata.
- Build an activity timeline.
- Index captured information.
- Add privacy exclusions and retention controls.
- Support questions about past activity.

**Outcome:** MIRA begins building a knowledge base from permitted digital activities.

## Phase 3 — Voice Assistant

- Integrate cloud speech-to-text.
- Add spoken responses using cloud text-to-speech.
- Support conversational follow-up questions.
- Add voice-based memory retrieval.
- Apply context minimization to every model request.

**Outcome:** Users can interact naturally with their personal knowledge base.

## Phase 4 — Daily Planning and Proactive Workflows

- Build a recurring scheduler.
- Generate daily plans.
- Create scheduled news briefings.
- Find learning resources.
- Support job discovery.
- Add recurring music and weekend recommendations.
- Save results locally and deliver them at the configured time.

**Outcome:** MIRA starts preparing useful information before the user requests it.

## Phase 5 — Project Intelligence

- Track project context and decisions.
- Identify unfinished work.
- Connect activity history with project goals.
- Generate progress summaries.
- Suggest next steps.
- Use project state when preparing daily plans.

**Outcome:** MIRA helps users resume work and make progress across multiple projects.

## Phase 6 — Controlled Computer Automation

- Add file operations.
- Open applications and URLs.
- Create notes and task records.
- Prepare documents.
- Support multi-step workflows.
- Add action confirmations and audit logs.

**Outcome:** MIRA can carry out useful tasks based on user instructions and relevant personal context.

## Phase 7 — Advanced Personalization

- Improve preference learning with user consent.
- Add more integrations.
- Improve ranking and recommendations.
- Support richer recurring routines.
- Improve long-term memory organization.
- Refine proactive behavior to reduce irrelevant notifications.

**Outcome:** MIRA becomes a more personalized assistant that adapts to the user's changing goals and routines.

# 15. What Makes MIRA Different?

MIRA is not intended to be merely a chatbot, a personal archive, or a scheduling application.

Its intended value comes from combining:

- A detailed local personal knowledge base.
- Selective use of cloud AI for reasoning and voice.
- Privacy-aware context retrieval.
- Proactive research and preparation.
- Personalized daily planning.
- Long-term project and activity recall.
- Voice-based interaction.
- Controlled computer automation.

For example, a conventional news app provides news, a job board provides job listings, and a calendar provides scheduled events.

MIRA aims to connect these activities to the user's personal preferences and goals, prepare relevant results in advance, and present them through one assistant.

These individual capabilities exist in other products. MIRA's differentiation must come from the quality of its integrated personal context, proactive workflows, and privacy-preserving architecture.

# 16. Long-Term Vision

The long-term goal is to create a personal assistant that understands enough of the user's digital life to help them make better use of their time and information.

MIRA should remember useful information, understand ongoing projects, recognize recurring needs, and prepare relevant material before it is required.

It could prepare a daily briefing, identify job opportunities, find study resources, recommend activities, organize tasks, and help the user resume unfinished work.

At the same time, personal information should remain under the user's control. Cloud AI should provide intelligence without needing unrestricted access to the user's entire digital history.

The user should not need to remember every detail, repeatedly search for the same information, or manually initiate every routine.

MIRA should help manage the information and recurring work around the user's life, leaving the user in control of decisions and actions.

# 17. Final Project Summary

**MIRA — Memory, Intelligence, Recall, Assistant** is a privacy-conscious, proactive personal AI assistant built around a locally stored knowledge base of the user's digital life.

It captures and organizes permitted personal information locally, retrieves relevant context when needed, and uses cloud AI models for language reasoning, summarization, planning, and voice interaction.

Rather than sending the entire knowledge base to cloud services, MIRA selects only the information required for each task.

It also proactively prepares personalized daily plans, news briefings, job opportunities, learning resources, music recommendations, weekend plans, and other recurring information based on the user's preferences.

Through voice and text, users can recall past activities, understand ongoing projects, find information, plan their time, and execute supported computer tasks.

**The central idea is to build an assistant that remembers your digital life, prepares for your needs, and helps you move forward—while keeping your personal knowledge under your control.**

---

# 18. Windows Desktop App & Web Installation

<p align="center">
  <img src="Client/public/icons/download-app-banner.png" alt="Download and Run MIRA on Windows" width="100%" />
</p>

MIRA is built for both **Windows Desktop** (native, bundled microservices) and **Web browsers**.

### Option A: Install MIRA Windows Desktop App (Recommended)
Download and execute the official NSIS setup installer:
```powershell
# Built setup installer:
Client\src-tauri\target\release\bundle\nsis\MIRA_0.1.0_x64-setup.exe
```
- **Single Installer:** Fully bundles Python backend services, Redis server, and the native Rust operator.
- **One-Click Experience:** Guides the user through a branded Windows setup wizard with Start Menu and Desktop shortcuts.
- **Smart Lifecycle:** Automatically boots child microservices on launch and gracefully shuts them down when closing the application.
- **Clean Uninstaller:** Fully uninstalls cleanly from Windows Settings > Installed Apps.

### Option B: Build the Windows Installer from Source
Run the automated multi-service packaging pipeline:
```powershell
python package_windows.py
```
Or simply double-click:
```cmd
package_windows.bat
```

### Option C: Run in Web / Development Mode
Start all services simultaneously in development mode:
```powershell
python start.py
```
Then open `http://localhost:9004` in your browser.
