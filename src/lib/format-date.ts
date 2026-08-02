export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export const DATE_FORMATS: DateFormat[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

// isoDate is a Postgres `date` value serialized as "YYYY-MM-DD" -- parsed
// as plain strings (not Date objects) to avoid timezone shifting the day.
export function formatDob(isoDate: string, format: DateFormat): string {
  const [year, month, day] = isoDate.split("-");
  switch (format) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return isoDate;
    case "DD/MM/YYYY":
    default:
      return `${day}/${month}/${year}`;
  }
}
