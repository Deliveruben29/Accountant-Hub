import { format } from "date-fns";

export function formatCurrency(amount: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string) {
  try {
    return format(new Date(dateString), "dd MMM yyyy");
  } catch (e) {
    return dateString;
  }
}
