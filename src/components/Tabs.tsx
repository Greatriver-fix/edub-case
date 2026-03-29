import React, { useState, Children } from 'react';
import type { ReactElement, ReactNode } from 'react';
import StyledButton from './StyledButton'; // Import StyledButton

// Define the props for the individual Tab component (which will be a child)
interface TabProps {
  label: string;
  children: React.ReactNode;
}

// Define the props for the Tabs container component
interface TabsProps {
  children: ReactElement<TabProps> | ReactElement<TabProps>[];
  initialActiveLabel?: string;
}

export function Tab({ label, children }: TabProps): ReactElement { // Return type is ReactElement
  // Tabs reads label and children from these wrappers and renders the active panel.
  return <>{children}</>;
}


function Tabs({ children, initialActiveLabel }: TabsProps) {
  const tabs = Children.toArray(children) as ReactElement<TabProps>[];

  // Determine the initial active tab label more safely
  const firstTabLabel = tabs.length > 0 && tabs[0] ? tabs[0].props.label : '';
  const defaultActiveLabel = initialActiveLabel ?? firstTabLabel;
  const [activeLabel, setActiveLabel] = useState<string>(defaultActiveLabel);

  // Find the content of the currently active tab, provide default empty fragment
  const activeTabContent: ReactNode = tabs.find(tab => tab.props.label === activeLabel)?.props.children ?? <></>;

  return (
    <div className="cs-tabs"> {/* Use the class from cs16.css */}
      {/* Render Tab Labels */}
      {tabs.map((tab) => {
        const label = tab.props.label;
        const isActive = label === activeLabel;
        // Note: cs16.css uses radio buttons conceptually, but we'll simulate with divs/buttons
        // We need unique IDs for accessibility if we were using actual radio inputs
        return (
          // Use StyledButton for tabs
          <StyledButton
            key={label}
            // We'll manage active state via style prop, not adding 'active' class to StyledButton directly
            // as StyledButton doesn't inherently know about tab active states.
            // className={`label ${isActive ? 'active' : ''}`}
            onClick={() => setActiveLabel(label)}
            style={{ // Apply tab-specific styles directly
              backgroundColor: isActive ? 'var(--bg)' : 'var(--secondary-bg)', // Adjust bg based on active
              color: isActive ? 'var(--accent)' : 'white',
              borderTop: 'solid 1px var(--border-light)',
              borderLeft: 'solid 1px var(--border-light)',
              borderRight: 'solid 1px var(--border-dark)',
              borderBottom: isActive ? 'none' : 'solid 1px var(--border-light)', // Hide bottom border if active
              padding: isActive ? '5px' : '4px 5px',
              height: isActive ? '29px' : '27px',
              position: 'relative',
              bottom: isActive ? '-1px' : '0', // Overlap panel border when active
              zIndex: isActive ? 11 : 10, // Ensure active tab is on top
              cursor: 'pointer',
              marginRight: '1px',
              fontFamily: 'ArialPixel, system-ui, sans-serif',
              fontSize: '1rem',
              lineHeight: '0.9375rem',
              minWidth: '64px',
              textAlign: 'left',
            }}
          >
            {label}
          </StyledButton>
        );
      })}

      {/* Render Active Tab Panel Content */}
      <div className="panel" style={{ display: 'block' }}> {/* Ensure panel area is always visible */}
        {activeTabContent}
      </div>
    </div>
  );
}

export default Tabs;
