# 🧠 Aether Agent Guidelines

## 🚀 Mission

Build a cross-platform mobile app using **Expo** (React Native) that serves as a "Task AI Copilot." The app should help users manage daily tasks with context-aware assistance, smart scheduling, and seamless voice interaction. The goal is to create an app that feels like having a personal assistant in your pocket — proactive, intelligent, and incredibly easy to use.

---

## 🏗️ Technical Foundation

### 1. **Framework: Expo + React Native**

- **Why**: Provides a unified development environment for both iOS and Android with native-like performance and access to device features.
- **Key Packages**:
  - `expo-router`: For navigation and routing.
  - `expo-speech`: For text-to-speech (TTS) functionality.
  - `expo-camera`, `expo-image-picker`: For image capture and uploads.
  - `expo-secure-store`: For secure local storage of sensitive data (API keys, tokens).
  - `expo-file-system`: For local file operations.
  - `@react-native-voice/voice` (or similar): For speech-to-text (STT).

### 2. **State Management**

- **Option A (Recommended)**: **Zustand** or **Redux Toolkit** for global state (user profile, AI preferences, current task context).
- **Option B**: **React Context** for simpler state management.
- **Local State**: Component-level state using React hooks.

### 3. **Styling**

- **Tailwind CSS for React Native**: Use `@tailwindcss/native` for rapid UI development with a utility-first approach.
- **Dark Mode**: Support both light and dark modes using `useColorScheme` hook.

### 4. **Offline Support**

- **PWA Capabilities**: Use Expo's offline support to allow users to view cached tasks and information without an internet connection.
- **Local Database**: Consider using **Realm** or **WatermelonDB** for offline-first data storage, synchronization when online, and conflict resolution.

---

## 🧩 Core Features to Implement

### 1. **User Onboarding & Authentication**

- **Email/Password Login**: Standard authentication flow.
- **SSO**: Google, Apple, Microsoft OAuth integration.
- **Voice Profile Setup**: Guide users through a short voice recording to capture their voice characteristics for future voice commands.

### 2. **Dashboard & Home Screen**

- **Today's Focus**: AI-curated list of top 3-5 tasks based on priority and context.
- **Quick Actions**: Voice input button, "Add Task" quick action.
- **Calendar View**: Visual representation of scheduled tasks.

### 3. **Voice Input Interface**

- **Real-time Transcription**: Display transcribed text as user speaks.
- **Natural Language Understanding (NLU)**: Parse commands like "Remind me to call John at 3 PM" or "What's my schedule for tomorrow?"
- **Voice Commands**:
  - Add/Edit/Delete tasks
  - Set reminders
  - Ask for schedule
  - Query AI Assistant

### 4. **AI Assistant (LLM Integration)**

- **Text Input**: Standard chat interface.
- **Voice Input**: Speak directly to the AI assistant.
- **Context-Aware Responses**: Provide intelligent suggestions based on user's schedule, location, and preferences.
- **Example Interactions**:
  - User: "I have a meeting in 30 minutes, what should I prepare?"
  - AI: "Your meeting with John is about the Q3 budget. You should bring the financial report. Would you like me to pull it up?"

### 5. **Task Management**

- **Task Creation**: Title, description, due date/time, priority, category.
- **Smart Scheduling**: AI suggests optimal times for tasks based on availability and energy levels.
- **Reminders**: Push notifications, SMS, or in-app alerts.
- **Subtasks**: Break down large tasks into manageable steps.

### 6. **Context-Aware Features**

- **Location-Based Reminders**: Remind user of tasks when they arrive at specific locations (e.g., "Remind me to buy milk when I leave work").
- **Time-Based Suggestions**: Proactive suggestions based on time of day (e.g., "It's 5 PM, time to review today's accomplishments").

---

## 📝 Development Phases

### Phase 1: Project Setup & Foundation

- Initialize Expo project with TypeScript.
- Set up routing with Expo Router.
- Configure Tailwind CSS for React Native.
- Create basic UI theme (light/dark mode).

### Phase 2: Core Features

- Implement authentication flow.
- Create task management CRUD operations.
- Set up local database for offline support.

### Phase 3: Voice & AI Integration

- Add speech-to-text and text-to-speech.
- Integrate LLM API for AI assistant.
- Implement voice command parsing.
- Create voice profile setup.

### Phase 4: Context-Aware Features

- Add location-based reminders.
- Implement smart scheduling algorithm.
- Create proactive notifications.

### Phase 5: Polishing & Deployment

- Implement analytics and user feedback.
- Optimize performance and bundle size.
- Prepare for App Store and Google Play Store submission.
- Set up CI/CD pipeline with EAS.

---

## 🛠️ API Integrations

### Required Services

- **LLM Provider**: OpenAI, Google Gemini, or Anthropic for AI assistant features.
- **Speech-to-Text**: Native device APIs or cloud-based services (e.g., Google Cloud Speech-to-Text).
- **Text-to-Speech**: Native device APIs for voice output.
- **Notifications**: Expo Push Notifications.
- **Authentication**: Firebase Authentication or custom backend.

### Backend Options

- **Option A (Recommended)**: **Firebase** - Provides auth, database (Firestore), and cloud functions out of the box.
- **Option B**: **Supabase** - Open-source alternative with PostgreSQL, auth, and real-time features.
- **Option C**: **Custom Backend** (Node.js/Python) with **MongoDB** or **PostgreSQL**.

---

## 📋 Quality Assurance

### Testing Requirements

- **Unit Tests**: Use **Jest** or **React Testing Library** for component testing.
- **E2E Tests**: Use **Detox** or **Appium** for end-to-end testing.
- **Manual Testing**: Test on both iOS and Android devices.
- **Voice Testing**: Test voice commands in various environments (quiet, noisy) and with different accents.

### Performance Metrics

- **App Launch Time**: Should be under 2 seconds.
- **Voice Command Latency**: Should be under 500ms for simple commands.
- **Offline Mode**: Should function seamlessly without internet connection.

---

## 📝 Best Practices

### Code Quality

- Use TypeScript with strict type checking.
- Follow **SOLID** design principles.
- Implement proper error handling and fallback mechanisms.
- Use environment variables for API keys and configuration.

### Security

- Store sensitive data in `expo-secure-store`.
- Use HTTPS for all API communication.
- Implement rate limiting on backend APIs.
- Sanitize all user inputs to prevent injection attacks.

### UX/UI

- Follow platform-specific design guidelines (Human Interface Guidelines for iOS, Material Design for Android).
- Provide haptic feedback for key interactions.
- Ensure accessibility with proper labels and ARIA roles.
- Use skeleton loaders and optimistic UI for better perceived performance.

---

## 📚 Recommended Learning Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/)
- [Tailwind CSS for React Native](https://tailwindcss.com/docs/guides/react-native)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [Realm Documentation](https://docs.realm.io/)

---

## 🤝 Agent Instructions

When implementing features, always:

1. **Consider both platforms** (iOS and Android) from the start.
2. **Prioritize user experience** - the app should feel intuitive and magical.
3. **Follow the design system** consistently across all screens.
4. **Implement offline-first** capabilities for better reliability.
5. **Add comprehensive error handling** with user-friendly messages.
6. **Document your code** with JSDoc comments.

Good luck building Aether! 🚀
