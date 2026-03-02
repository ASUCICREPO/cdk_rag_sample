# User Guide

This guide provides instructions for using the Learning Navigator chatbot.

---

## Prerequisites

The application must be deployed before use. See the [Deployment Guide](./deploymentGuide.md) for instructions.

---

## Introduction

Learning Navigator is an AI-powered chatbot assistant for the National Council for Mental Wellbeing's Mental Health First Aid (MHFA) program. It provides real-time guidance, answers FAQs, and helps navigate training resources using official MHFA documentation.

### Key Features

- AI-powered chat with real-time streaming responses
- Answers grounded in official MHFA documentation with source citations
- Role-based personalization (Instructor, Internal Staff, Learner)
- English and Spanish language support
- Escalation to human support when needed
- Lead capture for prospective users
- Admin dashboard with analytics and conversation oversight

---

## Getting Started

### Step 1: Access the Application

Navigate to the application URL provided after deployment (e.g., `https://main.<app-id>.amplifyapp.com`).

You will see the sign-in page powered by Amazon Cognito. Enter your email and password to authenticate.

- First-time users will be prompted to change their temporary password.
- Your account has a role assigned (`instructor`, `internal_staff`, or `learner`) that personalizes your experience.

### Step 2: Chat with the Navigator

After signing in, you'll see the chat interface with a welcome message and suggested prompts tailored to your role:

- **Instructors** see prompts about course management, invoicing, and the Instructor Policy Handbook
- **Internal Staff** see prompts about analytics, operational guidelines, and admin guidance
- **Learners** see prompts about MHFA training, certification, and resources

Click a suggested prompt or type your own question in the input bar. Press Enter or click the send button to submit.

### Step 3: View Streaming Responses

Responses stream in real time — you'll see text appearing incrementally as the AI generates its answer. Responses are formatted with markdown (headings, bullet points, bold text) for readability.

### Step 4: Review Citations

When the AI uses information from official MHFA documentation, source citations appear below the response as clickable cards. Each card shows the document name and links to the source PDF.

### Step 5: Rate Responses

Each assistant response has thumbs up and thumbs down buttons. Click one to rate the response as helpful or unhelpful. This feedback helps improve the system.

---

## Switching Languages

Use the language dropdown in the top-right header to switch between English and Español. The chatbot will respond in your selected language for all subsequent messages. Your conversation history is preserved when switching languages.

The application also auto-detects your browser language on first load.

---

## Escalating to Human Support

If the chatbot cannot resolve your issue, you can request human support:

1. Click the escalation option in the chat interface
2. Enter your contact email address
3. Confirm the escalation request
4. You'll see a confirmation message that a support team member will follow up

The escalation includes your conversation summary and contact information for context.

---

## Lead Capture (Unauthenticated Users)

If you're not yet a member, you can submit your contact information via the "Not a member? Get in touch" link on the sign-in page:

1. Click the link to open the lead capture form
2. Enter your name, email, and area of interest
3. Submit the form
4. You can dismiss the form at any time without restriction

---

## Admin Dashboard

The admin dashboard is available to users with the `internal_staff` role at the `/admin` URL.

### Conversations Tab

- View all conversation sessions with timestamps, user roles, and languages
- Filter by date range, user role, language, and sentiment score
- Expand any session to view the full message history

### Analytics Tab

- View usage metrics: total conversations, active sessions, average session duration
- Select time periods: 7 days, 30 days, or 90 days
- View sentiment trend charts showing average sentiment over time

### Escalations Tab

- View pending escalation requests with session details and contact info
- Filter by status (pending or resolved)
- Mark escalations as resolved after follow-up

### Feedback Tab

- View feedback aggregation: positive/negative counts and ratio
- Select time periods: 7 days, 30 days, or 90 days
- View daily trend charts showing feedback patterns over time

---

## Tips and Best Practices

- Be specific in your questions for more accurate, relevant answers
- Use the suggested prompts as starting points for common topics
- Check the source citations to verify information against official documents
- Switch to Spanish if you prefer responses in Español
- Rate responses to help improve the system over time
- If the chatbot can't help, use the escalation feature to connect with human support

---

## FAQ

### Q: What documents does the chatbot use to answer questions?
**A:** The chatbot is grounded in official MHFA documentation including the Instructor Policy Handbook, MHFA Connect User Guides, and National Council Brand Guidelines.

### Q: Can I use the chatbot without signing in?
**A:** Authentication is required for the chat interface. Unauthenticated users can submit their contact information via the lead capture form.

### Q: How do I change my role?
**A:** Roles are assigned by administrators in the Cognito User Pool. Contact your system administrator to update your role.

### Q: What happens when my session expires?
**A:** You'll see a "Session expired" prompt asking you to sign in again. Your conversation history is preserved — you won't lose your chat.

### Q: Is my conversation data private?
**A:** Yes. All data is encrypted at rest and in transit. PII is redacted from system logs. Internal staff can view conversation logs for quality assurance through the admin dashboard.

---

## Troubleshooting

### Issue: Chat responses are slow or not appearing
**Solution**: Check your internet connection. If the issue persists, try refreshing the page. The AI model may take a few seconds to begin streaming for complex queries.

### Issue: "Authentication required" error
**Solution**: Your session may have expired. Click "Sign in again" to re-authenticate. Your conversation will be preserved.

### Issue: Citations not showing
**Solution**: Citations only appear when the AI uses information from the Knowledge Base. General knowledge responses may not include citations.

### Issue: Admin dashboard shows "Access denied"
**Solution**: The admin dashboard requires the `internal_staff` role. Contact your administrator to verify your role assignment.

---

## Getting Help

If you encounter issues not covered in this guide:

- Use the escalation feature in the chatbot to request human support
- Open an issue on the project's GitHub repository
- Contact your system administrator
