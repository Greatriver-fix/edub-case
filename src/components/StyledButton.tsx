import React from 'react';

interface StyledButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'default';
  // Add other props like 'icon', 'loading', etc. in the future if needed
  children: React.ReactNode;
}

function StyledButton({
  variant = 'default',
  children,
  className = '', // Allow passing additional classes
  style = {}, // Allow passing additional inline styles
  disabled, // Handle disabled state
  ...props // Pass down any other standard button props (like onClick)
}: StyledButtonProps) {

  // Base styles from cs-btn (applied via className)
  const baseClass = 'cs-btn';

  // Additional styles based on variant
  let variantStyle: React.CSSProperties = {};
  if (variant === 'danger') {
    variantStyle = { backgroundColor: '#a04040' }; // Match the red used before
  } else if (variant === 'primary') {
    // Example: Use accent color for primary, though default cs-btn might be sufficient
    // variantStyle = { backgroundColor: 'var(--accent)', color: 'var(--border-dark)' };
  }
  // Default variant uses the base cs-btn styles

  // Combine passed styles with variant styles
  const combinedStyle = { ...variantStyle, ...style };

  return (
    <button
      className={`${baseClass} ${className}`} // Combine base class with any passed classes
      style={combinedStyle}
      disabled={disabled}
      {...props} // Spread remaining props
    >
      {children}
    </button>
  );
}

export default StyledButton;
