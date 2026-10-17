# MIRA — Project Overview

## 1. What Is MIRA?

MIRA is a personal AI assistant designed to collect and organize useful personal information, remember important details, retrieve relevant context, and help users continue their work through text or voice interactions.

The initial design prioritizes local information management and controlled sharing of relevant context with cloud AI models.

## 2. Planned Features

- **Personal Knowledge Base:** Store personal information, notes, files, and digital activity locally.
- **Smart Memory:** Remember important details, preferences, and past activities.
- **Contextual Recall:** Retrieve relevant information from past activities and conversations.
- **AI Chat:** Answer questions using relevant personal context.
- **Voice Assistant:** Support voice interaction through cloud AI models.
- **Privacy Control:** Send only relevant information to cloud AI models.
- **Project Continuity:** Remember project details and help continue unfinished work.

## 3. Future Scope — Advanced Features

- **Proactive Job Search:** Find suitable job opportunities and notify the user.
- **Personalized Learning:** Discover relevant courses, tutorials, and study resources.
- **Daily Planning:** Create personalized daily schedules and task plans.
- **Scheduled News:** Deliver personalized news at a specified time, such as 10 AM.
- **Smart Recommendations:** Suggest music, movies, and other content based on preferences.
- **Weekend Planning:** Recommend activities and plans for weekends.
- **Smart Reminders:** Remind the user about tasks, goals, and recurring routines.
- **Activity Insights:** Identify patterns in activities and suggest useful actions.
- **Computer Automation:** Perform supported computer tasks with permission.
- **Personalized Assistance:** Learn from preferences and adapt recommendations over time.

## 4. Architecture

MIRA is divided into five modules. Each module encapsulates its implementation and exposes a single public entry point containing the functions other modules are allowed to call.

```text
MIRA/
├── collector/
│   ├── internal/       # Private implementation
│   └── __init__.py     # Public interface
├── memory/
│   ├── internal/
│   └── __init__.py
├── engine/
│   ├── internal/
│   └── __init__.py
├── client/
│   ├── internal/
│   └── __init__.py
└── vault/
    ├── internal/
    └── __init__.py
```

`__init__.py` is a proposed Python entry-point convention; the exact public API for each module will be defined during implementation. A public interface may expose lifecycle functions such as `start()` and `stop()`, plus module-specific operations.

## 5. Modules

### Collector

**Purpose:** Collect information in the background and extract useful data.

**Responsibilities:**
- Run background collection tasks.
- Extract useful information from collected sources.
- Send extracted data to Memory for processing and storage.

### Memory

**Purpose:** Manage MIRA's short-term and long-term memory.

**Responsibilities:**
- Store information in appropriate formats.
- Organize short-term and long-term memory.
- Retrieve relevant information for other modules.
- Accept useful extracted data from Collector.

### Engine

**Purpose:** Coordinate AI requests and LLM interactions.

**Responsibilities:**
- Receive requests from Client.
- Retrieve relevant context from Memory.
- Call the selected cloud LLM or AI service.
- Return the response to Client.

### Client

**Purpose:** Provide the user-facing interface.

**Responsibilities:**
- Receive user input.
- Send requests to Engine.
- Display text responses and support voice interaction.
- Present Engine's responses to the user.

### Vault

**Purpose:** Store sensitive and internal application data securely.

**Responsibilities:**
- Manage LLM API keys and other credentials.
- Store application configuration and logs.
- Provide controlled access to data needed by other modules.

Vault is an internal application component, not a user-facing module.

## 6. How the Modules Connect

```text
                 ┌──────────────────┐
                 │      Client      │
                 │  User interaction│
                 └────────┬─────────┘
                          │ User request
                          ▼
                 ┌──────────────────┐
                 │      Engine      │◄──────────────┐
                 │  LLM coordination│               │
                 └────────┬─────────┘               │
                          │ Retrieve context         │ Response/context
                          ▼                          │
                 ┌──────────────────┐               │
                 │      Memory      │───────────────┘
                 │ Short/long-term  │
                 └────────▲─────────┘
                          │ Extracted information
                          │
                 ┌────────┴─────────┐
                 │     Collector    │
                 │ Background data │
                 └──────────────────┘

          Vault provides controlled access to credentials
          and internal application data for authorized modules.
```

### Main data flows

1. **Background memory flow:** Collector gathers and extracts information, then passes useful data to Memory.
2. **User request flow:** Client sends a request to Engine.
3. **Context retrieval flow:** Engine asks Memory for relevant context.
4. **AI response flow:** Engine sends the request and selected context to the cloud AI service, then returns the response to Client.
5. **Secure internal data flow:** Authorized modules access credentials and other internal data through Vault's public interface.

Modules should communicate through their public interfaces rather than importing or modifying one another's internal implementation directly.