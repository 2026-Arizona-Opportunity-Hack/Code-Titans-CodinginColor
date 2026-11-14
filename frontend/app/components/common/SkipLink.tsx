// First focusable element on every page: lets keyboard and screen-reader users
// jump past the navigation straight to the page content (<main id="main">).
export function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Skip to main content
    </a>
  );
}
