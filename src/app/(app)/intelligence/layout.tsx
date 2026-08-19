/**
 * Scopes the Intelligence visual system.
 *
 * These four pages are scanned rather than read: a manager wants the first
 * management signal inside the first viewport, not below a title block sized
 * for an article. The tightening is applied here rather than globally because
 * the rest of the product is read at a different pace and its headers are
 * correct as they are.
 *
 * `display: contents` on the wrapper: the shell lays out the page container's
 * children directly, and a real box here collapsed the whole layout. The class
 * is a styling hook the page container selects on, not a container itself.
 */
export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return <div className="intelligence-page">{children}</div>;
}
