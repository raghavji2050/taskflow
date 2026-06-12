export interface DailyUpdateTask {
  id: string;
  title: string;
}

export interface DailyUpdateGroup {
  categoryId: string | null;
  categoryName: string;
  tasks: DailyUpdateTask[];
}

export function formatDailyUpdateText(groups: DailyUpdateGroup[]): string {
  return groups
    .map((group) => {
      const points = group.tasks.map((task, index) => `${index + 1}. ${task.title}`).join("\n");
      return `Worked on ${group.categoryName}\n${points}`;
    })
    .join("\n\n");
}
