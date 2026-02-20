import { useEffect, useState } from "react";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { useAuthStore } from "../stores/authStore";

export default function OnboardingTutorial() {
  const { user } = useAuthStore();
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Only run for free users who haven't completed it yet and only on the editor page
    if (user && user.tier === "free") {
      const isCorrectPage = window.location.pathname.includes("/editor");
      if (isCorrectPage) {
        const hasSeen = localStorage.getItem("polyblocks_tutorial_seen");
        if (!hasSeen) {
          setRun(true);
        }
      }
    }
  }, [user]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem("polyblocks_tutorial_seen", "true");
    }
  };

    const steps: Step[] = [
    {
      target: "body",
      placement: "center",
      content: (
        <div>
          <h2 style={{ marginBottom: "10px", fontSize: "18px" }}>Welcome to Polyblocks!</h2>
          <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
            This is the ultimate no-code strategy builder for Polymarket. Let's take a quick tour to help you build your first trading bot.
          </p>
        </div>
      ),
      disableBeacon: true,
    },
    {
      target: ".block-palette",
      placement: "right",
      content: (
        <div>
          <h3 style={{ marginBottom: "8px", fontSize: "16px" }}>1. Drag & Drop Blocks</h3>
          <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
            Drag blocks from this palette onto the canvas to start building your logic. You have triggers, conditions, calculations, and execution blocks.
          </p>
        </div>
      ),
    },
    {
      target: ".react-flow__pane",
      placement: "top",
      content: (
        <div>
          <h3 style={{ marginBottom: "8px", fontSize: "16px" }}>2. Connect the Dots</h3>
          <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
            Connect blocks by dragging wires from outputs to inputs. Data flows from left to right.
          </p>
        </div>
      ),
    },
    {
      target: ".properties-panel",
      placement: "left",
      content: (
        <div>
          <h3 style={{ marginBottom: "8px", fontSize: "16px" }}>3. Configure Blocks</h3>
          <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
            Select any block to configure its settings here. This is where you choose your markets, timeframes, and thresholds.
          </p>
        </div>
      ),
    },
    {
      target: ".mode-toggle",
      placement: "bottom",
      content: (
        <div>
          <h3 style={{ marginBottom: "8px", fontSize: "16px" }}>4. Paper Trading vs Live Trading</h3>
          <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
            You can <strong>Paper Trade</strong> for free to test your strategy safely. 
            <br/><br/>
            To execute real money trades, toggle to <strong>Live Trading</strong> (Requires a Pro Subscription).
          </p>
        </div>
      ),
    },
    {
      target: "a[href='/pricing']",
      placement: "bottom",
      content: (
        <div>
          <h3 style={{ marginBottom: "8px", fontSize: "16px" }}>5. Ready to go Pro?</h3>
          <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
            Upgrade to Pro to unlock Live Trading and premium features! Check out the pricing page for options.
          </p>
        </div>
      ),
    }
  ];

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      steps={steps}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#8b5cf6',
          textColor: '#f8fafc',
          backgroundColor: '#0f172a',
          arrowColor: '#0f172a',
          overlayColor: 'rgba(0, 0, 0, 0.7)',
        },
        buttonClose: {
          display: 'none',
        },
        buttonSkip: {
          color: '#94a3b8',
          fontSize: '13px',
          fontWeight: 600,
        },
        buttonNext: {
          backgroundColor: '#8b5cf6',
          borderRadius: '8px',
          padding: '8px 16px',
          fontWeight: 600,
          fontSize: '13px',
          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
        },
        buttonBack: {
          color: '#cbd5e1',
          fontSize: '13px',
          fontWeight: 600,
        },
        tooltip: {
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #1e293b',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6)',
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        tooltipTitle: {
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '10px',
        },
        tooltipContent: {
          padding: '0',
        }
      }}
    />
  );
}