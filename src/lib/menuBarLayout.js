// Status items intentionally keep the browser's default flex order (0), so their
// DOM order never changes when the logo side changes. Only the surrounding
// title-bar regions move around that stable status sequence.
const ORDERS = Object.freeze({
  left: Object.freeze({
    brand: "order-first",
    spacer: "order-1",
    devAction: "order-2",
    search: "order-3",
  }),
  right: Object.freeze({
    brand: "order-last",
    spacer: "order-[-1]",
    devAction: "order-[-2]",
    search: "order-first",
  }),
});

export function getMenuBarLayoutOrder(side) {
  return side === "right" ? ORDERS.right : ORDERS.left;
}
