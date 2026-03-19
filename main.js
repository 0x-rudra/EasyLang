// main.js — Home page micro-interactions
document.addEventListener('DOMContentLoaded', () => {
  // Animate stats on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('animate-fade-up');
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.card, .stat, .testimonial, .step').forEach(el => observer.observe(el));

  // Typing animation in hero code preview
  const lines = document.querySelectorAll('.preview-code > *');
  lines.forEach((line, i) => {
    line.style.opacity = '0';
    line.style.transform = 'translateX(-8px)';
    line.style.transition = `opacity 0.3s ease ${i * 0.08}s, transform 0.3s ease ${i * 0.08}s`;
    setTimeout(() => { line.style.opacity = '1'; line.style.transform = 'none'; }, 200 + i * 80);
  });
});
