#!/bin/bash
# PARA Method Initialization for ADHD Brain Management

echo "🧠 Initializing PARA Method for ADHD Brain Management..."

# Source CCPM config
source .claude/ccpm.config

# Create GitHub labels for PARA
echo "Creating PARA labels in GitHub..."

# PARA Category Labels
gh label create "para:project" --color "0E8A16" --description "Active project with specific outcome" 2>/dev/null || echo "Label para:project already exists"
gh label create "para:area" --color "1D76DB" --description "Ongoing responsibility to maintain" 2>/dev/null || echo "Label para:area already exists"
gh label create "para:resource" --color "5319E7" --description "Reference material for future use" 2>/dev/null || echo "Label para:resource already exists"
gh label create "para:archive" --color "BFD4F2" --description "Inactive/completed item" 2>/dev/null || echo "Label para:archive already exists"

# ADHD-Specific Labels
gh label create "adhd:urgent" --color "D93F0B" --description "Requires immediate attention" 2>/dev/null || echo "Label adhd:urgent already exists"
gh label create "adhd:routine" --color "FBCA04" --description "Part of daily/weekly routine" 2>/dev/null || echo "Label adhd:routine already exists"
gh label create "adhd:hyperfocus" --color "B60205" --description "Good for hyperfocus session" 2>/dev/null || echo "Label adhd:hyperfocus already exists"
gh label create "adhd:low-energy" --color "C5DEF5" --description "Suitable for low energy times" 2>/dev/null || echo "Label adhd:low-energy already exists"
gh label create "adhd:blocked" --color "E99695" --description "Blocked by executive dysfunction" 2>/dev/null || echo "Label adhd:blocked already exists"

# Project Status Labels
gh label create "status:planning" --color "F9D0C4" --description "In planning phase" 2>/dev/null || echo "Label status:planning already exists"
gh label create "status:active" --color "0E8A16" --description "Actively being worked on" 2>/dev/null || echo "Label status:active already exists"
gh label create "status:paused" --color "FEF2C0" --description "Temporarily paused" 2>/dev/null || echo "Label status:paused already exists"
gh label create "status:review" --color "5319E7" --description "Ready for review" 2>/dev/null || echo "Label status:review already exists"

echo "✅ PARA labels created successfully!"

# Create initial area templates
echo "Creating initial area templates..."

# Health Management Area
mkdir -p areas/health-management
cat > areas/health-management/README.md << 'EOF'
# Health Management Area

## Standard to Maintain
- Medication taken on schedule
- Sleep tracking consistent
- Exercise routine maintained
- Mental health check-ins

## Daily Checklist
- [ ] Morning medication
- [ ] Evening medication
- [ ] Log sleep hours
- [ ] Physical activity (minimum 20 min)
- [ ] Mood check-in

## Weekly Review
- [ ] Review medication effectiveness
- [ ] Check appointment schedule
- [ ] Plan next week's activities
- [ ] Update health metrics

## Resources
- See: resources/adhd-strategies/
- See: resources/medication-info/
EOF

# Daily Routines Area
mkdir -p areas/daily-routines
cat > areas/daily-routines/README.md << 'EOF'
# Daily Routines Area

## Morning Routine
1. Wake up at consistent time
2. Take medication
3. Hydrate (drink water)
4. Quick physical movement
5. Review today's priorities

## Work Routine
1. Check calendar
2. Review task list
3. Set 3 main priorities
4. Use Pomodoro timer
5. Take regular breaks

## Evening Routine
1. Review day's accomplishments
2. Prepare for tomorrow
3. Wind-down activities
4. Set sleep alarm
5. Charge devices outside bedroom

## Troubleshooting
- If routine disrupted: Start with next step
- If overwhelmed: Pick one small task
- If hyperfocusing: Set timer boundaries
EOF

echo "✅ Initial areas created!"

# Create resource categories
echo "Creating resource categories..."

mkdir -p resources/adhd-strategies
mkdir -p resources/tools-and-apps
mkdir -p resources/research
mkdir -p resources/templates

# Create a sample resource
cat > resources/adhd-strategies/pomodoro-technique.md << 'EOF'
# Pomodoro Technique for ADHD

## Overview
Time management method that breaks work into intervals.

## ADHD Adaptations
- Shorter intervals (15-20 min instead of 25)
- Flexible break times
- Visual/audio timers
- Reward system after each interval

## Implementation
1. Set timer for 15-20 minutes
2. Work on single task
3. Take 5-minute break
4. After 4 intervals, longer break (15-30 min)

## Tools
- Forest app (gamification)
- Be Focused Pro
- Toggl Track
- Physical timer (reduces phone distraction)
EOF

echo "✅ Resource structure created!"

# Create project template
cat > resources/templates/project-template.md << 'EOF'
# Project: [Project Name]

## Outcome
What specific result will be achieved?

## Timeline
Start Date:
Target End Date:
Hard Deadline:

## Success Criteria
- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Criteria 3

## Next Actions
- [ ] Next action 1
- [ ] Next action 2
- [ ] Next action 3

## Resources Needed
- Resource 1
- Resource 2

## Potential Obstacles
- Obstacle 1: Mitigation strategy
- Obstacle 2: Mitigation strategy

## Notes
Additional thoughts and context
EOF

echo "✅ Templates created!"

# Create CLAUDE.md for PARA context
cat > CLAUDE.md << 'EOF'
# ADHD Brain Management System

This project uses the PARA Method for organization.

## Quick Start
- Projects: Active initiatives in `projects/`
- Areas: Ongoing responsibilities in `areas/`
- Resources: Reference materials in `resources/`
- Archives: Completed items in `archives/`

## ADHD Considerations
- Keep active projects limited (3-5 max)
- Use templates to reduce decision fatigue
- Break tasks into small, actionable steps
- Regular review cycles are essential

## Commands
- `/pm:init` - Initialize project management
- Check `.claude/commands/` for custom commands

## Context
See `.claude/context/para-method.md` for detailed PARA implementation.
EOF

echo "✅ CLAUDE.md created!"

echo "
🎉 PARA Method initialization complete!

Next steps:
1. Run /pm:init to complete GitHub integration
2. Create your first project in projects/
3. Review areas/ for your ongoing responsibilities
4. Add resources as you discover helpful information

Remember: Start small, be consistent, and adapt as needed!"