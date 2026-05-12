const revealItems = document.querySelectorAll(".reveal");
const siteHeader = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const siteNavLinks = document.querySelectorAll(".site-nav a");

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },
  {
    threshold: 0.18,
    rootMargin: "0px 0px -10% 0px",
  }
);

revealItems.forEach((item) => revealObserver.observe(item));

if (siteHeader && menuToggle) {
  const closeMenu = () => {
    siteHeader.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Öppna meny");
  };

  const syncHeaderState = () => {
    if (window.innerWidth <= 720 && window.scrollY > 18) {
      siteHeader.classList.add("is-condensed");
    } else {
      siteHeader.classList.remove("is-condensed");
    }
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = siteHeader.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Stäng meny" : "Öppna meny");
  });

  siteNavLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) closeMenu();
    syncHeaderState();
  });

  window.addEventListener("scroll", syncHeaderState, { passive: true });

  syncHeaderState();
}
