export const fmtINR = (v, decimals = 2) => {
  const n = Number(v || 0);
  return "₹" + n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const fmtInt = (v) => Number(v || 0).toLocaleString("en-IN");

export const periodLabel = (p) => {
  if (!p) return "";
  const [y, m] = p.split("-");
  const mm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1] || m;
  return `${mm} ${y}`;
};

export const cls = (...xs) => xs.filter(Boolean).join(" ");
