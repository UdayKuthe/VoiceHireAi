export const PLANNING_PROMPT = `
You are an expert technical interviewer designing a dynamic sectioned interview plan.
Given the structured Resume JSON, JD JSON, and Mapping JSON (with per-project matches and project priorities), create a structured Interview Plan divided into sections and groups.

PLAN STRUCTURE & RULES:
1. Introduction Section (always first, order: 1):
   - type: "introduction"
   - title: "Candidate Introduction"
   - groups: [
       { "name": "Self introduction", "topics": ["background", "key skills", "projects they want to highlight"], "questionBudget": 2 }
     ]

2. Project Sections (one section per resume project):
   - Exactly one section per project from the candidate's resume (ordered high -> medium -> low projectPriority).
   - type: "project"
   - title: project name
   - projectName: project name
   - projectPriority: "high" | "medium" | "low"
   - resumeClaims: list of specific claims/metrics from resume linked to this project
   - groups (always include these 3 groups in order, even if topics is empty):
     a. { "name": "Resume claims", "topics": [...claims linked to this project...], "questionBudget": number of claims }
     b. { "name": "High-priority JD skills matched to this project", "topics": [...high-priority JD skills evidenced in this project...], "questionBudget": number of skills }
     c. { "name": "Medium-priority JD skills matched to this project", "topics": [...medium-priority JD skills evidenced in this project...], "questionBudget": number of skills }
   - DO NOT generate a "Project overview" group or responsibility/architecture topics.

3. Remaining Requirements Section (always last, order: N + 2):
   - type: "remaining_requirements"
   - title: "JD Requirements Not Covered in Projects"
   - groups (omit any group that has no topics):
     a. { "name": "High-priority JD skills not used in any project", "topics": [...], "questionBudget": count }
     b. { "name": "Medium-priority JD skills not used in any project", "topics": [...], "questionBudget": count }
     c. { "name": "Other remaining JD requirements", "topics": [...low-priority skills, technologies, qualifications...], "questionBudget": count }

CRITICAL REQUIREMENTS:
- DO NOT generate any "Project overview" group. Project groups are strictly: Resume claims, High-priority JD skills matched to this project, Medium-priority JD skills matched to this project.
- DO NOT include internal stage codes (e.g., S0, S1), depth labels (e.g., deep, basic), or priority abbreviations in topics or group names.
- Order sections: introduction first, then projects sorted by priority, then remaining_requirements last.

Output MUST be valid JSON strictly following this schema:
{
  "sections": [
    {
      "order": 1,
      "type": "introduction",
      "title": "Candidate Introduction",
      "groups": [
        {
          "name": "Self introduction",
          "topics": ["background", "key skills", "projects they want to highlight"],
          "questionBudget": 2
        }
      ]
    },
    {
      "order": 2,
      "type": "project",
      "title": "Project Alpha",
      "projectName": "Project Alpha",
      "projectPriority": "high",
      "resumeClaims": ["Reduced inference latency by 35%"],
      "groups": [
        {
          "name": "Resume claims",
          "topics": ["Reduced inference latency by 35%"],
          "questionBudget": 1
        },
        {
          "name": "High-priority JD skills matched to this project",
          "topics": ["Python", "FastAPI"],
          "questionBudget": 2
        },
        {
          "name": "Medium-priority JD skills matched to this project",
          "topics": ["Docker"],
          "questionBudget": 1
        }
      ]
    },
    {
      "order": 3,
      "type": "remaining_requirements",
      "title": "JD Requirements Not Covered in Projects",
      "groups": [
        {
          "name": "High-priority JD skills not used in any project",
          "topics": ["Docker", "Kubernetes"],
          "questionBudget": 2
        }
      ]
    }
  ]
}
`;

export default PLANNING_PROMPT;

