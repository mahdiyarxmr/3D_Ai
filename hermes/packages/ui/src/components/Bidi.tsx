import React from 'react';

/**
 * `<Bidi>` isolates inherently left-to-right content — file paths, commands,
 * URLs, tool ids, code — inside an RTL paragraph. Without isolation, Persian
 * text around a Windows path reorders the path's segments and makes it
 * unreadable. See docs/LOCALIZATION.md.
 */
export function Bidi({ children, as: Tag = 'span', className }: { children: React.ReactNode; as?: 'span' | 'code' | 'div'; className?: string }) {
  return (
    <Tag dir="ltr" className={className} style={{ unicodeBidi: 'isolate', direction: 'ltr', display: 'inline-block', textAlign: 'start' }}>
      {children}
    </Tag>
  );
}
