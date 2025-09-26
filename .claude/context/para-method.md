# PARA Method Implementation

## Overview
This project uses the PARA Method (Projects, Areas, Resources, Archives) for organizing information and tasks related to ADHD brain management.

## Structure

### 1. PROJECTS
Active initiatives with specific outcomes and deadlines.
- Located in: `projects/`
- Format: Each project has its own directory
- Status: Active projects only
- Criteria: Has a clear end goal and timeline

### 2. AREAS
Ongoing responsibilities to maintain at a standard.
- Located in: `areas/`
- Examples: Health management, Daily routines, Work responsibilities
- Status: Continuously maintained
- Criteria: No end date, requires regular attention

### 3. RESOURCES
Topics or themes of ongoing interest for future reference.
- Located in: `resources/`
- Examples: ADHD strategies, Tools, Research, Templates
- Status: Reference material
- Criteria: Information to be referenced when needed

### 4. ARCHIVES
Inactive items from the other three categories.
- Located in: `archives/`
- Contains: Completed projects, inactive areas, outdated resources
- Status: Inactive but preserved
- Criteria: No longer actively needed but worth keeping

## Implementation Guidelines

### For Projects
- Each project should have:
  - Clear outcome definition
  - Timeline/deadline
  - Next actions list
  - Related resources

### For Areas
- Each area should have:
  - Standard to maintain
  - Regular review schedule
  - Checklists/procedures
  - Key metrics or indicators

### For Resources
- Each resource should be:
  - Well-categorized
  - Easy to search
  - Updated when new information is found
  - Tagged appropriately

### For Archives
- Move items when:
  - Project is completed
  - Area is no longer relevant
  - Resource is outdated
  - Regular quarterly review

## ADHD-Specific Adaptations

### Visual Organization
- Use clear folder structures
- Implement color coding where possible
- Create visual maps of project relationships

### Cognitive Load Management
- Keep active projects limited (max 3-5)
- Use templates to reduce decision fatigue
- Implement capture system for quick thoughts

### Executive Function Support
- Break projects into small, actionable tasks
- Use time-boxing for areas maintenance
- Create routines around resource review

### Attention Management
- Priority markers for urgent items
- Regular review cycles (weekly for projects, monthly for areas)
- Quick capture inbox for processing

## File Naming Conventions

### Projects
`YYYY-MM-DD-project-name/`
Example: `2024-01-15-medication-tracking/`

### Areas
`area-name/`
Example: `health-management/`

### Resources
`category/topic-name`
Example: `adhd-strategies/pomodoro-technique.md`

### Archives
`YYYY/original-category/item-name`
Example: `2024/projects/completed-habit-tracker/`

## Integration with CCPM

### GitHub Issues
- Projects: Use project labels
- Areas: Use area labels
- Resources: Use resource labels
- Archives: Close issues and add archived label

### Worktrees
- Active projects get their own worktree
- Areas maintained in main branch
- Resources stored in dedicated branch
- Archives moved to archive branch

## Review Cycles

### Daily
- Check project next actions
- Update today's priorities

### Weekly
- Review all active projects
- Process inbox items
- Update project statuses

### Monthly
- Review areas for maintenance
- Check resource organization
- Identify projects to archive

### Quarterly
- Full PARA review
- Archive completed items
- Reorganize as needed