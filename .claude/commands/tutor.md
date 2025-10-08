---
allowed-tools: Task
description: Your ADHD-friendly guide to the agent system - ask anything!
argument-hint: [optional: your question or topic]
---

# Agent Tutor

Your personal, ADHD-friendly guide to the entire agent system. Ask me anything about which agent to use, how workflows work, or when you're feeling overwhelmed. I'll break down complex processes into manageable steps.

## Task

Launch the agent-tutor to provide:
- Step-by-step workflow guidance
- Agent recommendations for specific tasks
- ADHD-friendly explanations and breakdowns
- Help when you're stuck or overwhelmed
- Exact commands and examples

## Process

1. **Understand Your Need**
   - Parse your question or topic
   - Identify if you need agent help, workflow guidance, or general support

2. **Launch Agent-Tutor**
   - Use Task tool with subagent_type: "agent-tutor"
   - Pass your question as the prompt for personalized help

3. **Agent Will:**
   - Provide clear, ADHD-friendly guidance
   - Break down complex workflows into simple steps
   - Recommend specific agents with exact commands
   - Offer encouragement and next steps

## Implementation

```javascript
// Parse the arguments
const question = $ARGUMENTS || "I need general help with the agent system";

// Construct the prompt for the agent-tutor
let prompt = "";
if (question.trim() === "" || question === "I need general help with the agent system") {
  prompt = "The user needs general guidance about the agent system. Provide an overview of available help and ask what specific area they'd like help with.";
} else {
  prompt = `The user is asking: "${question}". Please provide ADHD-friendly guidance, breaking down complex concepts into simple steps. Include specific agent recommendations with exact commands where applicable.`;
}

// Launch the agent-tutor
Task({
  subagent_type: "agent-tutor",
  description: "Provide ADHD-friendly guidance",
  prompt: prompt
});
```

## Example Usage

### General Help
```bash
# Get started with the tutor system
/tutor

# Ask for general guidance
/tutor help me understand this system
```

### Specific Questions
```bash
# Workflow questions
/tutor how do I add a new feature?
/tutor what's the workflow for implementing authentication?
/tutor how do I go from idea to working code?

# Agent questions
/tutor which agent should I use for planning?
/tutor how do I use the roadmap-orchestrator?
/tutor what's the difference between implementation-orchestrator and task-manager?
/tutor when should I use resilience-strategist?

# When stuck
/tutor I'm overwhelmed, help!
/tutor I'm stuck at step 3, what's next?
/tutor I forgot where I was in the process
```

### Specific Scenarios
```bash
# Feature development
/tutor I want to add email capture functionality
/tutor I need to improve the SQLite performance
/tutor how do I add voice transcription?

# Documentation
/tutor my specs are a mess, what do I do?
/tutor how do I document an architectural decision?
/tutor the roadmap-orchestrator found drift issues

# Implementation
/tutor I'm ready to start coding, what's next?
/tutor how do I run tests for my changes?
/tutor my implementation is failing, help!

# Resilience & Error Handling
/tutor how do I handle errors in my Gmail integration?
/tutor what retry patterns should I use for external APIs?
/tutor help me design resilience for voice capture
```

## Expected Output

The agent-tutor will provide:

### For General Questions
- Overview of available help areas
- Quick reference to common agents
- Suggested starting points based on your needs

### For Specific Questions
- Step-by-step breakdown of the process
- Exact commands to run
- Agent recommendations with reasons why
- Next steps and follow-up actions
- ADHD-friendly explanations

### For "Stuck" Situations
- Assessment of where you are in the process
- Clear identification of the next single step
- Gentle encouragement and support
- Specific commands to get unstuck

## Example Interactions

### User asks about implementing a feature:
```
User: /tutor how do I add voice capture?

Tutor: Great! Let me break this down into simple steps:

🔬 **Step 1: Research & Plan**
→ Use: capture-bridge-planner to research voice capture APIs and create a spec
→ Command: `Use capture-bridge-planner to research voice capture and create technical spec`

📋 **Step 2: Document Architecture**
→ Use: adr-curator if you make any architectural decisions
→ Command: `Use adr-curator to document [specific decision]`

🗺️ **Step 3: Update Roadmap**
→ Use: roadmap-orchestrator to sync your new spec
→ Command: `Use roadmap-orchestrator to sync all documentation`

Want me to show you what comes after step 1, or do you have questions about any of these steps?
```

### User asks when feeling overwhelmed:
```
User: /tutor I'm overwhelmed by all these agents

Tutor: I totally understand! The system has a lot of parts, but you don't need to learn everything at once.

Let's start simple:

🎯 **For 90% of what you'll do, you only need to know 2 agents:**
1. **capture-bridge-planner** - for research and planning (start here!)
2. **implementation-orchestrator** - for auto-pilot coding

🤝 **Here's what I suggest:**
1. Tell me ONE thing you want to accomplish today
2. I'll tell you exactly which agent to use
3. We'll ignore everything else for now

What's the one thing you'd like to work on? (Like "add email capture" or "fix a bug" or "understand the codebase")
```

## When to Use This Command

- **Starting out:** Need general orientation to the system
- **Specific questions:** Want to know how to use a particular agent
- **Workflow guidance:** Need step-by-step help with a process
- **Feeling stuck:** Don't know what to do next
- **Overwhelmed:** Need things broken down into smaller pieces
- **Quick reference:** Want a fast reminder about agent purposes

## ADHD-Friendly Features

The tutor is specifically designed for ADHD users:
- **Short responses** - No overwhelming walls of text
- **Clear structure** - Bullets, headers, visual breaks
- **One step at a time** - Never more than you can handle
- **Encouraging tone** - Patient and judgment-free
- **Interactive** - Asks follow-up questions to help you
- **Practical** - Always provides exact commands to run

Just type `/tutor` and ask anything! 🎯