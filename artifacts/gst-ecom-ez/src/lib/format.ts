export const fmtINR = (v: number | string | undefined, decimals = 2) => {
  const n = Number(v || 0);
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
};

export const fmtInt = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString("en-IN");

export const periodLabel = (p: string) => {
  if (!p) return "";
  const [y, m] = p.split("-");
  const mm =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][Number(m) - 1] || m;
  return `${mm} ${y}`;
};

export const cls = (...xs: (string | undefined | false | null)[]) =>
  xs.filter(Boolean).join(" ");
