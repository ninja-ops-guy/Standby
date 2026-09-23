const filters = [...document.querySelectorAll(".filter")];
const listings = [...document.querySelectorAll(".listing")];

filters.forEach((button) => {
  button.addEventListener("click", () => {
    filters.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const filter = button.dataset.filter;
    listings.forEach((listing) => {
      listing.hidden = filter !== "all" && listing.dataset.category !== filter;
    });
  });
});

const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const modalCopy = document.getElementById("modalCopy");
const escrowAmount = document.getElementById("escrowAmount");
const walletBefore = document.getElementById("walletBefore");
const simulateClaim = document.getElementById("simulateClaim");

let currentPrice = 0;

function money(value) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

document.querySelectorAll(".claim").forEach((button) => {
  button.addEventListener("click", () => {
    const numeric = Number(button.dataset.price.replace(/[^0-9.]/g, ""));
    currentPrice = numeric;
    modalCopy.textContent = `Claiming “${button.dataset.title}” would move ${money(numeric)} from the demo wallet into escrow. It would not count as completed GMV or platform revenue yet.`;
    escrowAmount.textContent = money(0);
    walletBefore.textContent = money(1000);
    simulateClaim.textContent = "Simulate escrow hold";
    simulateClaim.disabled = false;
    modal.hidden = false;
  });
});

function closeModal() {
  modal.hidden = true;
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

simulateClaim.addEventListener("click", () => {
  walletBefore.textContent = money(1000 - currentPrice);
  escrowAmount.textContent = money(currentPrice);
  simulateClaim.textContent = "Escrow hold simulated ✓";
  simulateClaim.disabled = true;
});
