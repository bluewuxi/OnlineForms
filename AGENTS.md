# Project Prompt

## Workspace

- Backend repo path: `D:\Projects\OnlineForms`
- Frontend repo path: `..\OnlineForms-Frontend`
- When a task needs frontend work, resolve the frontend repo relative to the current folder above.

## Delivery Rules

- Backend and frontend have independent phase plans defined in their own repositories.
- Treat backend phases and frontend phases as separate tracks. Do not assume task numbering or scope matches across repos.
- Each phase contains a list of tasks.
- Every task must link to a GitHub issue in the same repository as the task.
- Use one commit per task.
- Do not combine multiple tasks into one commit.

## Working Expectations

- Before implementing a task, identify which repo owns it and use that repo's phase/task definition and GitHub issue.
- When work spans both repos, split it into separate backend and frontend tasks if the phase plans define them separately.
- Keep commit history aligned with the issue/task structure for that repo.
