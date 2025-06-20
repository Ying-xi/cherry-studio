# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Standard Workflow

1. First think through the problem, read the codebase for relevant files, and write a plan to .claude/plan.md
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan
4. Then, begin working on the todo items, marking them as complete as you go
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity
7. Finally, add a review section to the .claude/plan.md file with a summary of the changes you made and any other relevant information

## IMPORTANT

- For tasks that require multiple steps, always break them down into clear, manageable sub-tasks. Create a detailed plan and to-do list, and consistently use a Markdown file to document and track progress for each step.
- You operate in an environment where `ast-grep` is available. For any search involving code structure or syntax, always default to `ast-grep --lang '<language>' -p '<pattern>'`. Only use text-based tools like `rg` or `grep` if explicitly instructed to perform a plain-text search.
- When interpreting instructions, prioritize clarity, step-by-step reasoning, and explicit documentation of your process. Avoid making assumptions; ask for clarification if requirements are ambiguous.

## Build/Test Commands

- `yarn dev` - Start development server with hot reload
- `yarn build` - Build for production (includes typecheck)
- `yarn typecheck` - Check TypeScript types for both processes
- `yarn lint` - Run ESLint and fix issues automatically
- `yarn test` - Run all tests (Vitest)
- `yarn test:main` - Run main process tests only
- `yarn test:renderer` - Run renderer process tests only
- `yarn test:watch` - Run tests in watch mode
- `yarn test:e2e` - Run Playwright E2E tests

## Code Style Guidelines

- **Imports**: Use simple-import-sort plugin for automatic import ordering
- **Formatting**: Prettier with single quotes, no semicolons, 120 char width, trailing commas none
- **Types**: TypeScript strict mode, explicit return types optional
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Components**: React functional components with hooks, styled-components for styling
- **Error Handling**: Use try-catch blocks, proper error types, no unused variables
- **File Structure**: Barrel exports, organized by feature/domain
- **Aliases**: Use `@renderer/*`, `@shared/*`, `@types` path aliases

## Architecture Overview

Cherry Studio is an Electron desktop application that provides a unified interface for multiple LLM providers.

### Core Structure

- **Main Process** (`src/main/`): Handles system operations, file management, WebDAV sync, and MCP servers
- **Renderer Process** (`src/renderer/`): React application with the user interface
- **Preload Scripts** (`src/preload/`): Bridge between main and renderer processes

### Key Architectural Components

1. **AI Core** (`src/renderer/src/aiCore/`): Implements adapters for different LLM providers (OpenAI, Anthropic, etc.)

2. **State Management**: Uses Redux Toolkit with slices for:

   - `assistants` - AI assistant configurations
   - `chats` - Conversation management
   - `runtime` - Application runtime state
   - `knowledge` - Knowledge base and embeddings

3. **Services** (`src/main/services/`):

   - `WebDAVService` - File sync and backup
   - `MCPService` - Model Context Protocol server management
   - `FileService` - Document processing and file operations

4. **IPC Communication**: Uses typed IPC channels defined in `src/main/preload.ts` for secure main-renderer communication

5. **Multi-Provider Support**: Each AI provider has its own client implementation in `aiCore/` with a common interface

### Technology Stack

- **Electron 35.4.0** with **React 19** and **TypeScript**
- **Vite** for fast development and building
- **Styled Components** for styling
- **Ant Design** for UI components
- **Redux Toolkit** for state management
- **Vitest** and **Playwright** for testing
