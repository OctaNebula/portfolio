import * as THREE from "https://esm.sh/three@0.175.0";
import { OrbitControls } from "https://esm.sh/three@0.175.0/examples/jsm/controls/OrbitControls.js";

console.log("Script.js loaded!");

// Desktop Icons System Configuration
let iconDraggingEnabled = false; // Toggle for icon dragging - disabled by default

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded fired!");
  
  // Initialize desktop icons FIRST to test
  console.log("About to call initDesktopIcons EARLY");
  initDesktopIcons();
  console.log("Desktop icons initialized EARLY");
  
  // Initialize taskbar
  initTaskbar();
  
  setupExpandingCirclesPreloader();
  
  // Initialize audio system early
  setTimeout(() => {
    initAudio();
    ensureAudioContextStarted();
  }, 1000);
  
  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;
  let audioData;
  let frequencyData;
  let audioReactivity = 1.5;
  let audioSensitivity = 7.0;
  let isAudioInitialized = false;
  let isAudioPlaying = false;
  let lastUserActionTime = Date.now();
  let updateGlow;
  let crypticMessageTimeout;
  let audioContextStarted = false;
  let audioSourceConnected = false;
  let currentAudioElement = null;
  let floatingParticles = [];
  let currentAudioSrc = null;
  let currentMessageIndex = 0;

  // Desktop Icons System
  let selectedIcon = null;
  let clickTimeout = null;

  // Function to toggle icon dragging - for future settings menu
  function toggleIconDragging(enabled) {
    iconDraggingEnabled = enabled;
    // Re-initialize icons to apply the change
    initDesktopIcons();
    console.log('Icon dragging:', enabled ? 'enabled' : 'disabled');
  }

  function initDesktopIcons() {
    console.log('initDesktopIcons called');
    const icons = document.querySelectorAll('.desktop-icon');
    console.log('Found desktop icons:', icons.length, icons);
    
    icons.forEach(icon => {
      // Only make icon draggable if dragging is enabled
      if (iconDraggingEnabled) {
        // Make icon draggable with GSAP
        Draggable.create(icon, {
        type: "x,y",
        bounds: "#content-layer",
        inertia: false,
        cursor: "auto",
        dragResistance: 0,
        edgeResistance: 0.65,
        minimumMovement: 3,
        allowEventDefault: false, // Prevent default behaviors that might cause lag
        dragClickables: true, // Allow dragging of clickable elements
        snap: {
          x: [0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800],
          y: [0, 96, 192, 288, 384, 480, 576, 672, 768]
        },
        onDragStart: function() {
          // Don't select when dragging starts
          console.log('Started dragging icon:', icon.dataset.window);
        },
        onDrag: function() {
          // Don't select during drag - just free movement
        },
        onDragEnd: function() {
          console.log('Drag ended. Position:', this.x, this.y);
          // Instant snap - no animation
          const snapX = Math.round(this.x / 80) * 80;
          const snapY = Math.round(this.y / 96) * 96;
          
          gsap.set(icon, {
            x: snapX,
            y: snapY
          });
          
          // Don't select after dragging - just snap to grid
          console.log('Instantly snapped to:', snapX, snapY);
        }
      });
      }
      
      // Single click selection
      icon.addEventListener('click', (e) => {
        console.log('Icon clicked!', icon);
        e.preventDefault();
        e.stopPropagation();
        
        // Select immediately for instant visual feedback
        selectIcon(icon);
        
        // Clear any pending double-click
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
        
        // Set timeout to check if this was part of a double-click
        clickTimeout = setTimeout(() => {
          console.log('Single click confirmed (no double-click)');
          // Icon is already selected, nothing more to do
          clickTimeout = null;
        }, 300);
      });
      
      // Double click to open window
      icon.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Clear single click timeout
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
        
        const windowType = icon.dataset.window;
        
        // Check if window already exists
        const existingWindow = document.querySelector(`.desktop-window[data-window-type="${windowType}"]`);
        
        if (existingWindow) {
          // If window is minimized, restore it
          if (existingWindow.dataset.minimized === 'true') {
            restoreWindow(existingWindow);
          } else {
            // If window is already open and visible, just bring it to front
            bringToFront(existingWindow);
          }
        } else {
          // Create new window
          openDesktopWindow(windowType);
        }
        
        console.log(`Opening window: ${windowType}`);
      });
    });
    
    // Add keyboard support for Enter key to open selected icon
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && selectedIcon) {
        e.preventDefault();
        e.stopPropagation();
        
        const windowType = selectedIcon.dataset.window;
        
        // Check if window already exists
        const existingWindow = document.querySelector(`.desktop-window[data-window-type="${windowType}"]`);
        
        if (existingWindow) {
          // If window is minimized, restore it
          if (existingWindow.dataset.minimized === 'true') {
            restoreWindow(existingWindow);
          } else {
            // Window exists and is visible, just bring to front
            bringWindowToFront(existingWindow);
          }
        } else {
          // Create new window
          openDesktopWindow(windowType);
        }
        
        console.log(`Opening window via Enter key: ${windowType}`);
      }
    });
    
    // Click elsewhere to deselect
    document.addEventListener('click', (e) => {
      // Use the actual clicked element, not e.target which can be wrong during fast drags
      const clickedElement = document.elementFromPoint(e.clientX, e.clientY);
      if (!clickedElement || !clickedElement.closest('.desktop-icon')) {
        deselectAllIcons();
      }
    });
  }
  
  function selectIcon(icon) {
    console.log('selectIcon called on:', icon);
    
    // Deselect all other icons
    deselectAllIcons();
    
    // Select this icon - add selected class to maintain hover state
    icon.classList.add('selected');
    selectedIcon = icon;
    console.log('Icon selected successfully');
  }
  
  function deselectAllIcons() {
    console.log('deselectAllIcons called');
    
    const icons = document.querySelectorAll('.desktop-icon');
    icons.forEach(icon => {
      icon.classList.remove('selected');
    });
    selectedIcon = null;
    console.log('All icons deselected');
  }
  
  // Window Management System
  let openWindows = [];
  let highestZIndex = 1000;

  function createDesktopWindow(windowType, title) {
    // Create window container
    const window = document.createElement('div');
    window.className = 'desktop-window';
    window.dataset.windowType = windowType;
    window.dataset.minimized = 'false'; // Initialize minimized state
    
    // Calculate responsive window size based on viewport
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // Set window size as percentage of viewport (max 600x400, min 350x250)
    const windowWidth = Math.min(600, Math.max(350, viewportWidth * 0.4));
    const windowHeight = Math.min(400, Math.max(250, viewportHeight * 0.5));
    
    window.style.width = `${windowWidth}px`;
    window.style.height = `${windowHeight}px`;
    
    // Position window with slight offset for multiple windows
    const offsetX = openWindows.length * 30;
    const offsetY = openWindows.length * 30;
    window.style.left = `${100 + offsetX}px`;
    window.style.top = `${80 + offsetY}px`;
    window.style.zIndex = ++highestZIndex;
    
    // Create titlebar
    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    
    // Create title section container
    const titleSection = document.createElement('div');
    titleSection.className = 'window-title-section';
    
    // Create window icon (get from corresponding desktop icon)
    const windowIcon = document.createElement('img');
    windowIcon.className = 'window-icon';
    windowIcon.alt = 'Window Icon';
    
    // Find the corresponding desktop icon and use its image source
    const desktopIcon = document.querySelector(`.desktop-icon[data-window="${windowType}"]`);
    if (desktopIcon) {
      const desktopIconImg = desktopIcon.querySelector('img');
      windowIcon.src = desktopIconImg ? desktopIconImg.src : 'assets/images/placeholder.png';
    } else {
      windowIcon.src = 'assets/images/placeholder.png';
    }
    
    // Add double-click to close functionality on window icon
    windowIcon.addEventListener('dblclick', (e) => {
      e.stopPropagation(); // Prevent titlebar double-click from firing
      window.dataset.buttonAnimating = 'true';
      closeWindow(window);
    });
    
    const titleText = document.createElement('div');
    titleText.className = 'window-title';
    titleText.textContent = title;
    
    const controls = document.createElement('div');
    controls.className = 'window-controls';
    
    // Minimize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'window-control-btn minimize';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'Minimize';
    
    // Maximize button
    const maximizeBtn = document.createElement('button');
    maximizeBtn.className = 'window-control-btn maximize';
    maximizeBtn.innerHTML = '□';
    maximizeBtn.title = 'Maximize';
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'window-control-btn close';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close';
    
    controls.appendChild(minimizeBtn);
    controls.appendChild(maximizeBtn);
    controls.appendChild(closeBtn);
    
    // Assemble title section
    titleSection.appendChild(windowIcon);
    titleSection.appendChild(titleText);
    
    // Assemble titlebar
    titlebar.appendChild(titleSection);
    titlebar.appendChild(controls);
    
    // Add double-click to maximize functionality on titlebar
    titlebar.addEventListener('dblclick', (e) => {
      // Only prevent if we're currently in the middle of an animation
      // Check if the flag was set very recently (within 100ms)
      const now = Date.now();
      if (!window.dataset.buttonAnimatingTimestamp || 
          (now - parseInt(window.dataset.buttonAnimatingTimestamp)) > 100) {
        maximizeWindow(window);
      }
    });
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'window-content iframe-content';
    
    // Create iframe for portfolio content
    const iframe = document.createElement('iframe');
    iframe.className = 'window-iframe';
    iframe.src = `https://octanebula.dev/${windowType}`;
    iframe.title = `${title} - Portfolio Content`;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    
    // CRITICAL: Add pointer-events none during resize to prevent event conflicts
    iframe.style.pointerEvents = 'auto';
    
    content.appendChild(iframe);
    
    // Assemble window
    window.appendChild(titlebar);
    window.appendChild(content);
    
    // Add resize handles
    addResizeHandles(window);
    
    // Add to content layer
    document.getElementById('content-layer').appendChild(window);
    
    // Make window draggable by titlebar
    Draggable.create(window, {
      type: "x,y",
      bounds: "#content-layer",
      trigger: titlebar,
      onDragStart: function() {
        // CRITICAL: Disable iframe pointer events during window drag to prevent conflicts
        const iframe = window.querySelector('.window-iframe');
        if (iframe) {
          iframe.style.pointerEvents = 'none';
        }
        
        bringWindowToFront(window);
      },
      onPress: function() {
        // Ensure this window comes to front immediately when drag is initiated
        bringWindowToFront(window);
      },
      onDragEnd: function() {
        // CRITICAL: Re-enable iframe pointer events after window drag
        const iframe = window.querySelector('.window-iframe');
        if (iframe) {
          iframe.style.pointerEvents = 'auto';
        }
      }
    });
    
    // Add event listeners
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      closeWindow(window);
    });
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      window.dataset.buttonAnimatingTimestamp = Date.now().toString();
      setTimeout(() => window.dataset.buttonAnimating = 'false', 500);
      minimizeWindow(window);
    });
    maximizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      window.dataset.buttonAnimatingTimestamp = Date.now().toString();
      setTimeout(() => window.dataset.buttonAnimating = 'false', 500);
      maximizeWindow(window);
    });
    
    // Bring to front when clicked (with event handling improvements)
    window.addEventListener('mousedown', (e) => {
      e.stopPropagation(); // Prevent event from bubbling to other windows
      bringWindowToFront(window);
    });
    
    // Add to open windows array
    openWindows.push(window);
    
    // Add to taskbar
    addWindowToTaskbar(window);
    
    // Animate window open
    gsap.fromTo(window, {
      scale: 0.8,
      opacity: 0
    }, {
      scale: 1,
      opacity: 1,
      duration: 0.3,
      ease: "back.out(1.7)"
    });
    
    return window;
  }

  function createBrowserWindow(windowType, title, url) {
    // Create window container
    const window = document.createElement('div');
    window.className = 'desktop-window browser-window';
    window.dataset.windowType = windowType;
    window.dataset.minimized = 'false';
    
    // Calculate responsive window size (larger for browser)
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // Browser windows are larger by default
    const windowWidth = Math.min(800, Math.max(500, viewportWidth * 0.6));
    const windowHeight = Math.min(600, Math.max(400, viewportHeight * 0.7));
    
    window.style.width = `${windowWidth}px`;
    window.style.height = `${windowHeight}px`;
    
    // Position window with slight offset
    const offsetX = openWindows.length * 30;
    const offsetY = openWindows.length * 30;
    window.style.left = `${100 + offsetX}px`;
    window.style.top = `${80 + offsetY}px`;
    window.style.zIndex = ++highestZIndex;
    
    // Create titlebar
    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    
    // Title section
    const titleSection = document.createElement('div');
    titleSection.className = 'window-title-section';
    
    // Browser icon
    const windowIcon = document.createElement('img');
    windowIcon.className = 'window-icon';
    windowIcon.src = './assets/images/browser.png';
    windowIcon.alt = 'Browser Icon';
    
    // Add double-click to close functionality on browser icon
    windowIcon.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      closeWindow(window);
    });
    
    const titleText = document.createElement('div');
    titleText.className = 'window-title';
    titleText.textContent = title;
    
    // Window controls
    const controls = document.createElement('div');
    controls.className = 'window-controls';
    
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'window-control-btn minimize';
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'Minimize';
    
    const maximizeBtn = document.createElement('button');
    maximizeBtn.className = 'window-control-btn maximize';
    maximizeBtn.innerHTML = '□';
    maximizeBtn.title = 'Maximize';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'window-control-btn close';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close';
    
    controls.appendChild(minimizeBtn);
    controls.appendChild(maximizeBtn);
    controls.appendChild(closeBtn);
    
    titleSection.appendChild(windowIcon);
    titleSection.appendChild(titleText);
    
    titlebar.appendChild(titleSection);
    titlebar.appendChild(controls);
    
    // Create browser navigation bar
    const navBar = document.createElement('div');
    navBar.className = 'browser-nav-bar';
    
    // Navigation buttons
    const navButtons = document.createElement('div');
    navButtons.className = 'nav-buttons';
    
    const backBtn = document.createElement('button');
    backBtn.className = 'nav-btn back-btn';
    backBtn.innerHTML = '&#8592;';
    backBtn.title = 'Back';
    backBtn.disabled = true;
    
    const forwardBtn = document.createElement('button');
    forwardBtn.className = 'nav-btn forward-btn';
    forwardBtn.innerHTML = '&#8594;';
    forwardBtn.title = 'Forward';
    forwardBtn.disabled = true;
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'nav-btn refresh-btn';
    refreshBtn.innerHTML = '&#8635;';
    refreshBtn.title = 'Refresh';
    
    navButtons.appendChild(backBtn);
    navButtons.appendChild(forwardBtn);
    navButtons.appendChild(refreshBtn);
    
    // URL bar
    const urlBar = document.createElement('div');
    urlBar.className = 'url-bar';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'url-input';
    urlInput.value = url || `https://octanebula.dev/${windowType}`;
    urlInput.readonly = true;
    
    urlBar.appendChild(urlInput);
    
    // Menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'nav-btn menu-btn';
    menuBtn.innerHTML = '&#9776;';
    menuBtn.title = 'Menu';
    
    navBar.appendChild(navButtons);
    navBar.appendChild(urlBar);
    navBar.appendChild(menuBtn);
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'window-content browser-content';
    
    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.className = 'browser-iframe';
    iframe.src = url || `https://octanebula.dev/${windowType}`;
    iframe.title = `${title} - Browser Content`;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    iframe.style.pointerEvents = 'auto';
    
    content.appendChild(iframe);
    
    // Assemble window
    window.appendChild(titlebar);
    window.appendChild(navBar);
    window.appendChild(content);
    
    // Add event listeners for browser functionality
    refreshBtn.addEventListener('click', () => {
      iframe.src = iframe.src;
    });
    
    // Add double-click to maximize functionality on titlebar
    titlebar.addEventListener('dblclick', (e) => {
      // Only prevent if we're currently in the middle of an animation
      // Check if the flag was set very recently (within 100ms)
      const now = Date.now();
      if (!window.dataset.buttonAnimatingTimestamp || 
          (now - parseInt(window.dataset.buttonAnimatingTimestamp)) > 100) {
        maximizeWindow(window);
      }
    });
    
    // Add event listeners for window controls
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      closeWindow(window);
    });
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      window.dataset.buttonAnimatingTimestamp = Date.now().toString();
      setTimeout(() => {
        if (window.dataset) window.dataset.buttonAnimating = 'false';
      }, 500);
      minimizeWindow(window);
    });
    maximizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dataset.buttonAnimating = 'true';
      window.dataset.buttonAnimatingTimestamp = Date.now().toString();
      setTimeout(() => {
        if (window.dataset) window.dataset.buttonAnimating = 'false';
      }, 500);
      maximizeWindow(window);
    });
    
    // Add resize handles
    addResizeHandles(window);
    
    // Add to content layer
    document.getElementById('content-layer').appendChild(window);
    
    // Make window draggable by titlebar
    Draggable.create(window, {
      type: "x,y",
      bounds: "#content-layer",
      trigger: titlebar,
      onDragStart: function() {
        const iframe = window.querySelector('.browser-iframe');
        if (iframe) {
          iframe.style.pointerEvents = 'none';
        }
        bringWindowToFront(window);
      },
      onPress: function() {
        bringWindowToFront(window);
      },
      onDrag: function() {
        // Keep window in bounds during drag
      },
      onDragEnd: function() {
        const iframe = window.querySelector('.browser-iframe');
        if (iframe) {
          iframe.style.pointerEvents = 'auto';
        }
        updateTaskbarButtonStates();
      }
    });
    
    // Bring to front when clicked
    window.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      bringWindowToFront(window);
    });
    
    // Add to open windows array
    openWindows.push(window);
    
    // Add to taskbar
    addWindowToTaskbar(window);
    
    // Update taskbar state
    updateTaskbarButtonStates();
    
    // Animate window open (same as regular windows)
    gsap.fromTo(window, {
      scale: 0.8,
      opacity: 0
    }, {
      scale: 1,
      opacity: 1,
      duration: 0.3,
      ease: "back.out(1.7)"
    });
    
    return window;
  }

  function addResizeHandles(window) {
    // Define all resize handle types and their behavior
    const handles = [
      { class: 'resize-nw', cursor: 'nw-resize', edges: ['top', 'left'] },
      { class: 'resize-ne', cursor: 'ne-resize', edges: ['top', 'right'] },
      { class: 'resize-sw', cursor: 'sw-resize', edges: ['bottom', 'left'] },
      { class: 'resize-se', cursor: 'se-resize', edges: ['bottom', 'right'] },
      { class: 'resize-n', cursor: 'n-resize', edges: ['top'] },
      { class: 'resize-s', cursor: 's-resize', edges: ['bottom'] },
      { class: 'resize-w', cursor: 'w-resize', edges: ['left'] },
      { class: 'resize-e', cursor: 'e-resize', edges: ['right'] }
    ];

    handles.forEach(handle => {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = `window-resize-handle ${handle.class}`;
      window.appendChild(resizeHandle);

      // Make each handle draggable for resizing
      Draggable.create(resizeHandle, {
        type: "x,y",
        cursor: handle.cursor,
        onDragStart: function() {
          // Store initial window properties
          this.startX = gsap.getProperty(window, "x");
          this.startY = gsap.getProperty(window, "y");
          this.startWidth = window.offsetWidth;
          this.startHeight = window.offsetHeight;
          
          // CRITICAL: Disable iframe pointer events during resize to prevent conflicts
          const iframe = window.querySelector('.window-iframe, .browser-iframe');
          if (iframe) {
            iframe.style.pointerEvents = 'none';
          }
          
          bringWindowToFront(window);
        },
        onDrag: function() {
          const deltaX = this.x;
          const deltaY = this.y;
          
          let newX = this.startX;
          let newY = this.startY;
          let newWidth = this.startWidth;
          let newHeight = this.startHeight;

          // Handle horizontal resizing
          if (handle.edges.includes('left')) {
            newX = this.startX + deltaX;
            newWidth = this.startWidth - deltaX;
          } else if (handle.edges.includes('right')) {
            newWidth = this.startWidth + deltaX;
          }

          // Handle vertical resizing
          if (handle.edges.includes('top')) {
            newY = this.startY + deltaY;
            newHeight = this.startHeight - deltaY;
          } else if (handle.edges.includes('bottom')) {
            newHeight = this.startHeight + deltaY;
          }

          // Apply minimum size constraints
          const minWidth = 350;
          const minHeight = 250;
          
          if (newWidth < minWidth) {
            if (handle.edges.includes('left')) {
              newX = this.startX + (this.startWidth - minWidth);
            }
            newWidth = minWidth;
          }
          
          if (newHeight < minHeight) {
            if (handle.edges.includes('top')) {
              newY = this.startY + (this.startHeight - minHeight);
            }
            newHeight = minHeight;
          }

          // Apply the new dimensions
          gsap.set(window, {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
          });
        },
        onDragEnd: function() {
          // Reset handle position
          gsap.set(this.target, { x: 0, y: 0 });
          
          // CRITICAL: Re-enable iframe pointer events after resize
          const iframe = window.querySelector('.window-iframe, .browser-iframe');
          if (iframe) {
            iframe.style.pointerEvents = 'auto';
          }
        }
      });
    });
  }

  function bringWindowToFront(window) {
    window.style.zIndex = ++highestZIndex;
    updateTaskbarButtonStates();
  }

  function closeWindow(window) {
    // Remove from taskbar
    removeWindowFromTaskbar(window);
    
    // Animate close
    gsap.to(window, {
      scale: 0.8,
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => {
        window.remove();
        openWindows = openWindows.filter(w => w !== window);
      }
    });
  }

  function minimizeWindow(window) {
    // Mark window as minimized instead of hiding it
    window.dataset.minimized = 'true';
    
    // Save current actual position (including any transforms from dragging)
    const rect = window.getBoundingClientRect();
    const contentLayer = document.getElementById('content-layer');
    const contentRect = contentLayer.getBoundingClientRect();
    
    // Calculate position relative to content layer
    window.dataset.originalLeft = (rect.left - contentRect.left) + 'px';
    window.dataset.originalTop = (rect.top - contentRect.top) + 'px';
    
    // Get start button position for animation target
    const startButton = document.querySelector('.start-button');
    const startButtonRect = startButton.getBoundingClientRect();
    const windowRect = window.getBoundingClientRect();
    
    // Calculate target position (start button center)
    const targetX = startButtonRect.left + startButtonRect.width / 2 - windowRect.width / 2;
    const targetY = startButtonRect.top + startButtonRect.height / 2 - windowRect.height / 2;
    
    // Minimize animation towards start menu
    gsap.to(window, {
      x: targetX - parseInt(window.style.left),
      y: targetY - parseInt(window.style.top),
      scale: 0.1,
      opacity: 0,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => {
        window.style.visibility = 'hidden';
        // Reset transform for clean restore
        gsap.set(window, { x: 0, y: 0, scale: 1 });
      }
    });
    
    // Update taskbar to show minimized state
    updateTaskbarButtonStates();
  }

  function restoreWindow(window) {
    // Remove minimized state
    window.dataset.minimized = 'false';
    window.style.visibility = 'visible';
    
    // Restore to original position if saved and clear any transforms
    if (window.dataset.originalLeft && window.dataset.originalTop) {
      window.style.left = window.dataset.originalLeft;
      window.style.top = window.dataset.originalTop;
      // Clear any GSAP transforms from dragging
      gsap.set(window, { x: 0, y: 0 });
    }
    
    // Get start button position for animation start point
    const startButton = document.querySelector('.start-button');
    const startButtonRect = startButton.getBoundingClientRect();
    
    // Calculate start position (from start button center)
    const windowRect = window.getBoundingClientRect();
    const startX = startButtonRect.left + startButtonRect.width / 2 - windowRect.width / 2;
    const startY = startButtonRect.top + startButtonRect.height / 2 - windowRect.height / 2;
    
    // Set initial state (at start menu position, small and transparent)
    gsap.set(window, {
      x: startX - parseInt(window.style.left),
      y: startY - parseInt(window.style.top),
      scale: 0.1,
      opacity: 0
    });
    
    // Restore animation flying back from start menu
    gsap.to(window, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      duration: 0.4,
      ease: "power2.out"
    });
    
    // Bring to front and update taskbar (this handles both z-index and taskbar state)
    bringWindowToFront(window);
  }

  function maximizeWindow(window) {
    // Toggle between maximized and normal
    if (window.dataset.maximized === 'true') {
      // Restore
      gsap.to(window, {
        x: window.dataset.originalX,
        y: window.dataset.originalY,
        width: window.dataset.originalWidth,
        height: window.dataset.originalHeight,
        duration: 0.3,
        ease: "power2.out"
      });
      window.dataset.maximized = 'false';
    } else {
      // Store original position/size
      window.dataset.originalX = gsap.getProperty(window, "x");
      window.dataset.originalY = gsap.getProperty(window, "y");
      window.dataset.originalWidth = window.style.width || '400px';
      window.dataset.originalHeight = window.style.height || '300px';
      
      // Maximize
      gsap.to(window, {
        x: 0,
        y: 0,
        width: '100%',
        height: '100%',
        duration: 0.3,
        ease: "power2.out"
      });
      window.dataset.maximized = 'true';
    }
  }

  function openDesktopWindow(windowType) {
    // Check for existing window (including minimized ones)
    const existingWindow = openWindows.find(w => w.dataset.windowType === windowType);
    if (existingWindow) {
      // If window is minimized, restore it
      if (existingWindow.dataset.minimized === 'true') {
        restoreWindow(existingWindow);
      } else {
        // If window is already open and visible, just bring it to front
        bringWindowToFront(existingWindow);
      }
      return;
    }
    
    // Create window with appropriate title
    const titles = {
      'about': 'About Me - Browser',
      'projects': 'Projects',
      'skills': 'Skills',
      'contact': 'Contact'
    };
    
    const title = titles[windowType] || windowType.toUpperCase();
    
    // Use different window types based on content
    if (windowType === 'about') {
      // Use browser window for About page
      createBrowserWindow(windowType, title, `https://octanebula.dev/${windowType}`);
    } else {
      // Use basic window for other content
      createDesktopWindow(windowType, title);
    }
    
    console.log(`Opened ${windowType} window`);
  }

  // Taskbar Management System
  function initTaskbar() {
    console.log('Initializing taskbar...');
    
    // Initialize time display
    updateTaskbarTime();
    setInterval(updateTaskbarTime, 1000);
    
    // Add start button functionality
    const startButton = document.querySelector('.start-button');
    if (startButton) {
      startButton.addEventListener('click', () => {
        console.log('Start button clicked - TODO: implement start menu');
        // TODO: Add start menu functionality later
      });
    }
    
    // Add system tray functionality
    const audioToggle = document.querySelector('.audio-visualizer-toggle');
    if (audioToggle) {
      audioToggle.addEventListener('click', () => {
        console.log('Audio visualizer toggle clicked');
        
        // Create or show audio player for myheart.mp3
        let audioPlayer = document.getElementById('desktop-audio-player');
        
        if (!audioPlayer) {
          // Create audio element
          audioPlayer = document.createElement('audio');
          audioPlayer.id = 'desktop-audio-player';
          audioPlayer.controls = true;
          audioPlayer.src = './assets/audio/myheart.mp3';
          audioPlayer.style.position = 'fixed';
          audioPlayer.style.bottom = '60px';
          audioPlayer.style.right = '20px';
          audioPlayer.style.zIndex = '10000';
          audioPlayer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
          audioPlayer.style.border = '1px solid #ff4e42';
          audioPlayer.style.borderRadius = '5px';
          
          // Add to page
          document.body.appendChild(audioPlayer);
          
          // Connect to visualizer if audio system is ready
          if (typeof connectAudioElement === 'function') {
            setTimeout(() => connectAudioElement(audioPlayer), 100);
          }
          
          console.log('Created audio player for myheart.mp3');
        } else {
          // Toggle visibility
          if (audioPlayer.style.display === 'none') {
            audioPlayer.style.display = 'block';
          } else {
            audioPlayer.style.display = 'none';
          }
        }
      });
    }
    
    console.log('Taskbar initialized');
  }

  function updateTaskbarTime() {
    const timeElement = document.querySelector('.time-display');
    const dateElement = document.querySelector('.date-display');
    
    if (timeElement && dateElement) {
      const now = new Date();
      
      // Format time as HH:MM:SS
      const time = now.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // Format date as DDD DD MMM
      const date = now.toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      }).toUpperCase();
      
      timeElement.textContent = time;
      dateElement.textContent = date;
    }
  }

  function addWindowToTaskbar(window) {
    const taskbarWindows = document.getElementById('taskbar-windows');
    const windowType = window.dataset.windowType;
    const windowTitle = window.querySelector('.window-title').textContent;
    
    // Create taskbar button
    const taskbarBtn = document.createElement('div');
    taskbarBtn.className = 'taskbar-window-btn active';
    taskbarBtn.dataset.windowId = window.dataset.windowType;
    taskbarBtn.textContent = windowTitle;
    taskbarBtn.title = windowTitle;
    
    // Add click handler with proper Windows behavior
    taskbarBtn.addEventListener('click', () => {
      // Check if window is minimized
      if (window.dataset.minimized === 'true') {
        restoreWindow(window);
      } else if (window.style.visibility === 'hidden') {
        // Fallback check for hidden windows
        restoreWindow(window);
      } else {
        // Window is visible - check if it's the active window
        const topWindow = getTopWindow();
        if (window === topWindow) {
          // Window is active, minimize it (standard Windows behavior)
          minimizeWindow(window);
        } else {
          // Window is visible but not active, bring to front
          bringWindowToFront(window);
        }
      }
      updateTaskbarButtonStates();
    });
    
    taskbarWindows.appendChild(taskbarBtn);
    window.taskbarButton = taskbarBtn;
    
    updateTaskbarButtonStates();
  }

  function removeWindowFromTaskbar(window) {
    if (window.taskbarButton) {
      window.taskbarButton.remove();
      updateTaskbarButtonStates();
    }
  }

  function updateTaskbarButtonStates() {
    const buttons = document.querySelectorAll('.taskbar-window-btn');
    const topWindow = getTopWindow();
    
    buttons.forEach(btn => {
      const windowId = btn.dataset.windowId;
      const correspondingWindow = openWindows.find(w => w.dataset.windowType === windowId);
      
      // Remove all state classes first
      btn.classList.remove('active', 'minimized');
      
      if (correspondingWindow) {
        if (correspondingWindow.dataset.minimized === 'true') {
          // Window is minimized
          btn.classList.add('minimized');
        } else if (correspondingWindow === topWindow) {
          // Window is active (on top)
          btn.classList.add('active');
        }
        // If window exists but is not minimized or active, it has no special class (inactive)
      }
    });
  }

  function getTopWindow() {
    let topWindow = null;
    let highestZ = 0;
    
    openWindows.forEach(window => {
      // Only consider non-minimized windows
      if (window.dataset.minimized !== 'true') {
        const z = parseInt(window.style.zIndex) || 0;
        if (z > highestZ) {
          highestZ = z;
          topWindow = window;
        }
      }
    });
    
    return topWindow;
  }

  function setupExpandingCirclesPreloader() {
    const canvas = document.getElementById("preloader-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let time = 0;
    let lastTime = 0;
    const maxRadius = 80;
    const circleCount = 5;
    const dotCount = 24;

    function animate(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;
      time += deltaTime * 0.001;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 78, 66, 0.9)";
      ctx.fill();
      for (let c = 0; c < circleCount; c++) {
        const circlePhase = (time * 0.3 + c / circleCount) % 1;
        const radius = circlePhase * maxRadius;
        const opacity = 1 - circlePhase;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 78, 66, ${opacity * 0.2})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        for (let i = 0; i < dotCount; i++) {
          const angle = (i / dotCount) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          const size = 2 * (1 - circlePhase * 0.5);
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(255, 78, 66, ${opacity * 0.1})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 78, 66, ${opacity * 0.9})`;
          ctx.fill();
        }
      }
      if (document.getElementById("loading-overlay").style.display !== "none") {
        requestAnimationFrame(animate);
      }
    }
    requestAnimationFrame(animate);
  }
  function initFloatingParticles() {
    const container = document.getElementById("floating-particles");
    const numParticles = 1000;

    // Clear any existing particles
    container.innerHTML = "";
    floatingParticles = [];

    // Get window dimensions for better positioning
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const centerX = windowWidth / 2;
    const centerY = windowHeight / 2;

    for (let i = 0; i < numParticles; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.style.position = "absolute";

      // Make all particles the same small size
      particle.style.width = "1.5px";
      particle.style.height = "1.5px";
      particle.style.backgroundColor = `rgba(255, ${
        Math.floor(Math.random() * 100) + 78
      }, ${Math.floor(Math.random() * 100) + 66}, ${
        Math.random() * 0.5 + 0.2
      })`;
      particle.style.borderRadius = "50%";

      // Create a large hollow area in the center
      const minDistance = 200; // Minimum distance from center
      const maxDistance = Math.max(windowWidth, windowHeight) * 0.8; // Use 80% of the larger dimension

      // Use polar coordinates for even distribution
      const angle = Math.random() * Math.PI * 2;

      // Use square root distribution for more even radial distribution
      // (prevents clustering at the center that happens with linear distribution)
      const distanceFactor = Math.sqrt(Math.random());
      const distance =
        minDistance + distanceFactor * (maxDistance - minDistance);

      // Calculate position
      const x = Math.cos(angle) * distance + centerX;
      const y = Math.sin(angle) * distance + centerY;

      particle.style.left = x + "px";
      particle.style.top = y + "px";

      // Store particle properties for animation
      const particleObj = {
        element: particle,
        x: x,
        y: y,
        speed: Math.random() * 0.5 + 0.1,
        angle: Math.random() * Math.PI * 2,
        angleSpeed: (Math.random() - 0.5) * 0.02,
        amplitude: Math.random() * 50 + 20, // Increased amplitude for wider movement
        size: 1.5, // Fixed size
        pulseSpeed: Math.random() * 0.04 + 0.01,
        pulsePhase: Math.random() * Math.PI * 2
      };

      floatingParticles.push(particleObj);
      container.appendChild(particle);
    }

    // Start animation
    animateFloatingParticles();
  }

  // Animate floating particles
  function animateFloatingParticles() {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    let time = 0;

    function updateParticles() {
      time += 0.01;

      floatingParticles.forEach((particle) => {
        // Update angle
        particle.angle += particle.angleSpeed;

        // Calculate orbit around center with some drift
        const orbitX = centerX + Math.cos(particle.angle) * particle.amplitude;
        const orbitY = centerY + Math.sin(particle.angle) * particle.amplitude;

        // Add some noise movement
        const noiseX = Math.sin(time * particle.speed + particle.angle) * 5;
        const noiseY =
          Math.cos(time * particle.speed + particle.angle * 0.7) * 5;

        // Apply movement without audio reactivity
        const newX = orbitX + noiseX;
        const newY = orbitY + noiseY;

        // Update position
        particle.element.style.left = newX + "px";
        particle.element.style.top = newY + "px";

        // Pulse size slightly without audio
        const pulseFactor =
          1 + Math.sin(time * particle.pulseSpeed + particle.pulsePhase) * 0.3;
        const newSize = particle.size * pulseFactor;

        particle.element.style.width = newSize + "px";
        particle.element.style.height = newSize + "px";

        // Adjust opacity based on pulse
        const baseOpacity =
          0.2 +
          Math.sin(time * particle.pulseSpeed + particle.pulsePhase) * 0.1;
        particle.element.style.opacity = Math.min(0.8, baseOpacity);
      });

      requestAnimationFrame(updateParticles);
    }

    requestAnimationFrame(updateParticles);
  }

  function initAudio() {
    if (isAudioInitialized) return true;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 2048;
      audioAnalyser.smoothingTimeConstant = 0.8;
      audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
      frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
      // Don't connect analyser directly to destination - let audio elements handle output
      isAudioInitialized = true;
      
      // AUTO-CONNECT ALL AUDIO ELEMENTS
      connectAllAudioElements();
      
      addTerminalMessage("AUDIO ANALYSIS SYSTEM INITIALIZED.");
      // showNotification("AUDIO ANALYSIS SYSTEM ONLINE");
      return true;
    } catch (error) {
      console.error("Audio initialization error:", error);
      addTerminalMessage("ERROR: AUDIO SYSTEM INITIALIZATION FAILED.");
      showNotification("AUDIO SYSTEM ERROR");
      return false;
    }
  }

  // Auto-connect all audio elements to the visualizer
  function connectAllAudioElements() {
    const audioElements = document.querySelectorAll('audio, video');
    console.log('Found audio elements:', audioElements.length);
    
    audioElements.forEach((audioElement, index) => {
      try {
        if (!audioElement.dataset.connected) {
          const source = audioContext.createMediaElementSource(audioElement);
          source.connect(audioAnalyser);
          source.connect(audioContext.destination); // Keep audio audible
          audioElement.dataset.connected = 'true';
          
          console.log(`Connected audio element ${index + 1}:`, audioElement.src || audioElement.currentSrc);
          
          // Set up play/pause listeners
          audioElement.addEventListener('play', () => {
            isAudioPlaying = true;
            console.log('Audio started playing');
          });
          
          audioElement.addEventListener('pause', () => {
            isAudioPlaying = false;
            console.log('Audio paused');
          });
          
          audioElement.addEventListener('ended', () => {
            isAudioPlaying = false;
            console.log('Audio ended');
          });
        }
      } catch (error) {
        console.log(`Audio element ${index + 1} already connected or error:`, error);
      }
    });

    // Watch for new audio elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if ((node.tagName === 'AUDIO' || node.tagName === 'VIDEO') && !node.dataset.connected) {
              setTimeout(() => connectAudioElement(node), 100);
            }
            // Check children
            node.querySelectorAll?.('audio:not([data-connected]), video:not([data-connected])').forEach(connectAudioElement);
          }
        });
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Connect a single audio element
  function connectAudioElement(audioElement) {
    if (!audioContext || !audioAnalyser || audioElement.dataset.connected) return;
    
    try {
      const source = audioContext.createMediaElementSource(audioElement);
      source.connect(audioAnalyser);
      source.connect(audioContext.destination);
      audioElement.dataset.connected = 'true';
      
      console.log('Connected new audio element:', audioElement.src || audioElement.currentSrc);
      
      audioElement.addEventListener('play', () => { isAudioPlaying = true; });
      audioElement.addEventListener('pause', () => { isAudioPlaying = false; });
      audioElement.addEventListener('ended', () => { isAudioPlaying = false; });
    } catch (error) {
      console.log('Error connecting audio element:', error);
    }
  }

  function ensureAudioContextStarted() {
    if (!audioContext) {
      if (!initAudio()) return false;
    }
    if (audioContext.state === "suspended") {
      audioContext
        .resume()
        .then(() => {
          if (!audioContextStarted) {
            audioContextStarted = true;
            addTerminalMessage("AUDIO CONTEXT RESUMED.");
          }
        })
        .catch((err) => {
          console.error("Failed to resume audio context:", err);
          addTerminalMessage("ERROR: FAILED TO RESUME AUDIO CONTEXT.");
        });
    } else {
      audioContextStarted = true;
    }
    return true;
  }

  function cleanupAudioSource() {
    if (audioSource) {
      try {
        audioSource.disconnect();
        audioSourceConnected = false;
        audioSource = null;
      } catch (e) {
        console.log("Error disconnecting previous source:", e);
      }
    }
  }

  function createNewAudioElement() {
    if (currentAudioElement) {
      if (currentAudioElement.parentNode) {
        currentAudioElement.parentNode.removeChild(currentAudioElement);
      }
    }
    const newAudioElement = document.createElement("audio");
    newAudioElement.id = "audio-player";
    newAudioElement.className = "audio-player";
    newAudioElement.crossOrigin = "anonymous";
    document
      .querySelector(".audio-controls")
      .insertBefore(newAudioElement, document.querySelector(".controls-row"));
    currentAudioElement = newAudioElement;
    return newAudioElement;
  }

  function setupAudioSource(audioElement) {
    try {
      if (!ensureAudioContextStarted()) {
        addTerminalMessage(
          "ERROR: AUDIO CONTEXT NOT AVAILABLE. CLICK ANYWHERE TO ENABLE AUDIO."
        );
        return false;
      }
      cleanupAudioSource();
      try {
        // Only create a new media element source if one doesn't already exist
        if (!audioSourceConnected) {
          audioSource = audioContext.createMediaElementSource(audioElement);
          audioSource.connect(audioAnalyser);
          audioSourceConnected = true;
        }
        return true;
      } catch (error) {
        console.error("Error creating media element source:", error);
        if (
          error.name === "InvalidStateError" &&
          error.message.includes("already connected")
        ) {
          addTerminalMessage(
            "AUDIO SOURCE ALREADY CONNECTED. ATTEMPTING TO PLAY ANYWAY."
          );
          return true;
        }
        addTerminalMessage(
          "ERROR: FAILED TO SETUP AUDIO SOURCE. " + error.message
        );
        return false;
      }
    } catch (error) {
      console.error("Error setting up audio source:", error);
      addTerminalMessage("ERROR: FAILED TO SETUP AUDIO SOURCE.");
      return false;
    }
  }

  function initAudioFile(file) {
    try {
      if (!isAudioInitialized && !initAudio()) {
        return;
      }
      const audioPlayer = createNewAudioElement();
      const fileURL = URL.createObjectURL(file);
      currentAudioSrc = fileURL;
      audioPlayer.src = fileURL;
      audioPlayer.onloadeddata = function () {
        if (setupAudioSource(audioPlayer)) {
          audioPlayer
            .play()
            .then(() => {
              isAudioPlaying = true;
              zoomCameraForAudio(true);
            })
            .catch((e) => {
              console.warn("Auto-play prevented:", e);
              addTerminalMessage(
                "WARNING: AUTO-PLAY PREVENTED BY BROWSER. CLICK PLAY TO START AUDIO."
              );
            });
        }
      };
      document.getElementById("file-label").textContent = file.name;
      document.querySelectorAll(".demo-track-btn").forEach((btn) => {
        btn.classList.remove("active");
      });
      addTerminalMessage(`AUDIO FILE LOADED: ${file.name}`);
      showNotification("AUDIO FILE LOADED");
    } catch (error) {
      console.error("Audio file error:", error);
      addTerminalMessage("ERROR: AUDIO FILE PROCESSING FAILED.");
      showNotification("AUDIO FILE ERROR");
    }
  }

  function loadAudioFromURL(url) {
    try {
      if (!isAudioInitialized && !initAudio()) {
        return;
      }
      ensureAudioContextStarted();
      const audioPlayer = createNewAudioElement();
      currentAudioSrc = url;
      audioPlayer.src = url;
      audioPlayer.onloadeddata = function () {
        if (setupAudioSource(audioPlayer)) {
          audioPlayer
            .play()
            .then(() => {
              isAudioPlaying = true;
              zoomCameraForAudio(true);
              addTerminalMessage(`PLAYING DEMO TRACK: ${url.split("/").pop()}`);
              showNotification(`PLAYING: ${url.split("/").pop()}`);
            })
            .catch((e) => {
              console.warn("Play prevented:", e);
              addTerminalMessage(
                "WARNING: AUDIO PLAYBACK PREVENTED BY BROWSER. CLICK PLAY TO START AUDIO."
              );
              showNotification("CLICK PLAY TO START AUDIO");
            });
        }
      };
      const filename = url.split("/").pop();
      document.getElementById("file-label").textContent = filename;
      addTerminalMessage(`LOADING AUDIO FROM URL: ${url.substring(0, 40)}...`);
      showNotification("AUDIO URL LOADED");
    } catch (error) {
      console.error("Audio URL error:", error);
      addTerminalMessage("ERROR: AUDIO URL PROCESSING FAILED.");
      showNotification("AUDIO URL ERROR");
    }
  }
  const circularCanvas = document.getElementById("circular-canvas");
  const circularCtx = circularCanvas.getContext("2d");

  function resizeCircularCanvas() {
    circularCanvas.width = circularCanvas.offsetWidth;
    circularCanvas.height = circularCanvas.offsetHeight;
  }
  resizeCircularCanvas();
  window.addEventListener("resize", resizeCircularCanvas);

  function drawCircularVisualizer() {
    if (!audioAnalyser) return;
    const width = circularCanvas.width;
    const height = circularCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    circularCtx.clearRect(0, 0, width, height);
    audioAnalyser.getByteFrequencyData(frequencyData);
    const numPoints = 180;
    // Keep original ring size regardless of canvas size
    const baseRadius = 450 * 0.4; // Fixed at original 450px container size
    circularCtx.beginPath();
    circularCtx.arc(centerX, centerY, baseRadius * 1.2, 0, Math.PI * 2);
    circularCtx.fillStyle = "rgba(255, 78, 66, 0.05)";
    circularCtx.fill();
    const numRings = 3;
    for (let ring = 0; ring < numRings; ring++) {
      const ringRadius = baseRadius * (0.7 + ring * 0.15);
      const opacity = 0.8 - ring * 0.2;
      circularCtx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const freqRangeStart = Math.floor(
          (ring * audioAnalyser.frequencyBinCount) / (numRings * 1.5)
        );
        const freqRangeEnd = Math.floor(
          ((ring + 1) * audioAnalyser.frequencyBinCount) / (numRings * 1.5)
        );
        const freqRange = freqRangeEnd - freqRangeStart;
        let sum = 0;
        const segmentSize = Math.floor(freqRange / numPoints);
        for (let j = 0; j < segmentSize; j++) {
          const freqIndex =
            freqRangeStart + ((i * segmentSize + j) % freqRange);
          sum += frequencyData[freqIndex];
        }
        const value = sum / (segmentSize * 255);
        // Moderate ring reactivity
        const adjustedValue = value * audioSensitivity * audioReactivity * 0.15;
        const dynamicRadius = ringRadius * (1 + adjustedValue * 0.8);
        const angle = (i / numPoints) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * dynamicRadius;
        const y = centerY + Math.sin(angle) * dynamicRadius;
        if (i === 0) {
          circularCtx.moveTo(x, y);
        } else {
          circularCtx.lineTo(x, y);
        }
      }
      circularCtx.closePath();
      let gradient;
      if (ring === 0) {
        gradient = circularCtx.createRadialGradient(
          centerX,
          centerY,
          ringRadius * 0.8,
          centerX,
          centerY,
          ringRadius * 1.2
        );
        gradient.addColorStop(0, `rgba(255, 78, 66, ${opacity})`);
        gradient.addColorStop(1, `rgba(194, 54, 47, ${opacity * 0.7})`);
      } else if (ring === 1) {
        gradient = circularCtx.createRadialGradient(
          centerX,
          centerY,
          ringRadius * 0.8,
          centerX,
          centerY,
          ringRadius * 1.2
        );
        gradient.addColorStop(0, `rgba(194, 54, 47, ${opacity})`);
        gradient.addColorStop(1, `rgba(255, 179, 171, ${opacity * 0.7})`);
      } else {
        gradient = circularCtx.createRadialGradient(
          centerX,
          centerY,
          ringRadius * 0.8,
          centerX,
          centerY,
          ringRadius * 1.2
        );
        gradient.addColorStop(0, `rgba(255, 179, 171, ${opacity})`);
        gradient.addColorStop(1, `rgba(255, 78, 66, ${opacity * 0.7})`);
      }
      circularCtx.strokeStyle = gradient;
      circularCtx.lineWidth = 2 + (numRings - ring);
      circularCtx.stroke();
      circularCtx.shadowBlur = 15;
      circularCtx.shadowColor = "rgba(255, 78, 66, 0.7)";
    }
    circularCtx.shadowBlur = 0;
  }
  const spectrumCanvas = document.getElementById("spectrum-canvas");
  const spectrumCtx = spectrumCanvas.getContext("2d");

  function resizeSpectrumCanvas() {
    spectrumCanvas.width = spectrumCanvas.offsetWidth;
    spectrumCanvas.height = spectrumCanvas.offsetHeight;
  }
  resizeSpectrumCanvas();
  window.addEventListener("resize", resizeSpectrumCanvas);

  function drawSpectrumAnalyzer() {
    if (!audioAnalyser) return;
    const width = spectrumCanvas.width;
    const height = spectrumCanvas.height;
    spectrumCtx.clearRect(0, 0, width, height);
    audioAnalyser.getByteFrequencyData(frequencyData);
    const barWidth = width / 256;
    let x = 0;
    for (let i = 0; i < 256; i++) {
      const barHeight =
        (frequencyData[i] / 255) * height * (audioSensitivity / 5);
      const hue = (i / 256) * 20 + 0;
      spectrumCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      spectrumCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
    spectrumCtx.strokeStyle = "rgba(255, 78, 66, 0.2)";
    spectrumCtx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = height * (i / 4);
      spectrumCtx.beginPath();
      spectrumCtx.moveTo(0, y);
      spectrumCtx.lineTo(width, y);
      spectrumCtx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = width * (i / 8);
      spectrumCtx.beginPath();
      spectrumCtx.moveTo(x, 0);
      spectrumCtx.lineTo(x, height);
      spectrumCtx.stroke();
    }
    spectrumCtx.fillStyle = "rgba(255, 78, 66, 0.7)";
    spectrumCtx.font = '10px "TheGoodMonolith", monospace';
    spectrumCtx.textAlign = "center";
    const freqLabels = ["0", "1K", "2K", "4K", "8K", "16K"];
    for (let i = 0; i < freqLabels.length; i++) {
      const x = (width / (freqLabels.length - 1)) * i;
      spectrumCtx.fillText(freqLabels[i], x, height - 5);
    }
  }

  function updateAudioWave() {
    if (!audioAnalyser) return;
    audioAnalyser.getByteTimeDomainData(audioData);
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i] - 128);
    }
    const average = sum / audioData.length;
    const normalizedAverage = average / audioData.length;
    const wave = document.getElementById("audio-wave");
    const scale =
      1 + normalizedAverage * audioReactivity * (audioSensitivity / 5);
    wave.style.transform = `translate(-50%, -50%) scale(${scale})`;
    wave.style.borderColor = `rgba(255, 78, 66, ${
      0.1 + normalizedAverage * 0.3
    })`;
  }

  function calculateAudioMetrics() {
    if (!audioAnalyser) return;
    audioAnalyser.getByteFrequencyData(frequencyData);
    let maxValue = 0;
    let maxIndex = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxValue) {
        maxValue = frequencyData[i];
        maxIndex = i;
      }
    }
    const sampleRate = audioContext.sampleRate;
    const peakFrequency =
      (maxIndex * sampleRate) / (audioAnalyser.frequencyBinCount * 2);
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i];
    }
    const amplitude = sum / (frequencyData.length * 255);
    document.getElementById("peak-value").textContent = `${Math.round(
      peakFrequency
    )} HZ`;
    document.getElementById("amplitude-value").textContent = amplitude.toFixed(
      2
    );
    const stabilityValue = 50 + Math.round(amplitude * 50);
    document.getElementById(
      "stability-value"
    ).textContent = `${stabilityValue}%`;
    document.getElementById("stability-bar").style.width = `${stabilityValue}%`;
    if (stabilityValue < 40) {
      document.getElementById("status-indicator").style.color = "#ff00a0";
    } else if (stabilityValue < 70) {
      document.getElementById("status-indicator").style.color = "#ffae00";
    } else {
      document.getElementById("status-indicator").style.color = "#ff4e42";
    }
    if (Math.random() < 0.05) {
      document.getElementById("mass-value").textContent = (
        1 +
        amplitude * 2
      ).toFixed(3);
      document.getElementById("energy-value").textContent = `${(
        amplitude * 10
      ).toFixed(1)}e8 J`;
      document.getElementById("variance-value").textContent = (
        amplitude * 0.01
      ).toFixed(4);
      const phases = ["π/4", "π/2", "π/6", "3π/4"];
      document.getElementById("phase-value").textContent =
        phases[Math.floor(Math.random() * phases.length)];
    }
  }

  function scheduleCrypticMessages() {
    if (crypticMessageTimeout) {
      clearTimeout(crypticMessageTimeout);
    }

    const delay = Math.random() * 15000 + 10000; // 10-25 seconds

    crypticMessageTimeout = setTimeout(() => {
      if (Date.now() - lastUserActionTime > 10000) {
        const messages = [
          "GSAP.TO('#FILIP', {POSITION: 'WEBFLOW', DURATION: '3.0 QUANTUM_CYCLES'});",
          "CONST FILIP = NEW DESIGNER({SKILLS: ['GSAP', 'THREEJS', 'WEBFLOW', 'NEURAL_UI']});",
          "AWAIT WEBFLOW.HIRE(FILIP, {ROLE: 'DESIGNER', SALARY: 'COMPETITIVE'});",
          "SYSTEM.INTEGRATE(FILIP.CREATIVITY, {TARGET: 'WEBFLOW_ECOSYSTEM', EFFICIENCY: 0.97});",
          "TIMELINE.FORK({AGENT: 'FILIP', MISSION: 'ELEVATE_DIGITAL_EXPERIENCES', PROBABILITY: 0.998});"
        ];

        // Get the current message and increment the index
        const selectedMessage = messages[currentMessageIndex];
        addTerminalMessage(selectedMessage, true);

        // Move to the next message, loop back to the beginning if we've shown all messages
        currentMessageIndex = (currentMessageIndex + 1) % messages.length;
      }

      scheduleCrypticMessages();
    }, delay);
  }
  document.addEventListener("mousemove", function () {
    lastUserActionTime = Date.now();
  });
  document.addEventListener("click", function () {
    lastUserActionTime = Date.now();
    if (!isAudioInitialized) {
      initAudio();
    } else if (audioContext && audioContext.state === "suspended") {
      audioContext.resume();
    }
  });
  document.addEventListener("keydown", function () {
    lastUserActionTime = Date.now();
  });
  setTimeout(() => {
    scheduleCrypticMessages();
    setTimeout(() => {
      addTerminalMessage("FILIPPORTFOLIO.VERSION = 'EXCEPTIONAL';", true);
    }, 15000);
  }, 10000);
  const loadingOverlay = document.getElementById("loading-overlay");
  setTimeout(() => {
    loadingOverlay.style.opacity = 0;
    setTimeout(() => {
      loadingOverlay.style.display = "none";
      initAudio();
      initFloatingParticles();
    }, 500);
  }, 3000);

  function updateTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    document.getElementById(
      "timestamp"
    ).textContent = `TIME: ${hours}:${minutes}:${seconds}`;
  }
  setInterval(updateTimestamp, 1000);
  updateTimestamp();
  const terminalContent = document.getElementById("terminal-content");
  const typingLine = terminalContent.querySelector(".typing");
  let messageQueue = [
    "SYSTEM INITIALIZED. AUDIO ANALYSIS READY.",
    "SCANNING FOR ANOMALIES IN FREQUENCY SPECTRUM."
  ];

  function typeNextMessage() {
    if (messageQueue.length === 0) return;
    const message = messageQueue.shift();
    let charIndex = 0;
    const typingInterval = setInterval(() => {
      if (charIndex < message.length) {
        typingLine.textContent = message.substring(0, charIndex + 1);
        charIndex++;
      } else {
        clearInterval(typingInterval);
        const newLine = document.createElement("div");
        newLine.className = "terminal-line command-line";
        newLine.textContent = message;
        terminalContent.insertBefore(newLine, typingLine);
        typingLine.textContent = "";
        terminalContent.scrollTop = terminalContent.scrollHeight;
        setTimeout(typeNextMessage, 5000);
      }
    }, 50);
  }

  function addTerminalMessage(message, isCommand = false) {
    const newLine = document.createElement("div");
    const isFilipMessage =
      message.toLowerCase().includes("filip") ||
      message.toLowerCase().includes("webflow");
    if (isCommand) {
      if (isFilipMessage) {
        newLine.className = "terminal-line command-line";
      } else {
        newLine.className = "terminal-line command-line";
      }
    } else {
      newLine.className = "terminal-line";
    }
    newLine.textContent = message;
    terminalContent.insertBefore(newLine, typingLine);
    terminalContent.scrollTop = terminalContent.scrollHeight;
  }
  setTimeout(typeNextMessage, 3000);
  const waveformCanvas = document.getElementById("waveform-canvas");
  const waveformCtx = waveformCanvas.getContext("2d");

  function resizeCanvas() {
    waveformCanvas.width = waveformCanvas.offsetWidth * window.devicePixelRatio;
    waveformCanvas.height =
      waveformCanvas.offsetHeight * window.devicePixelRatio;
    waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function drawWaveform() {
    const width = waveformCanvas.width / window.devicePixelRatio;
    const height = waveformCanvas.height / window.devicePixelRatio;
    waveformCtx.clearRect(0, 0, width, height);
    waveformCtx.fillStyle = "rgba(0, 0, 0, 0.2)";
    waveformCtx.fillRect(0, 0, width, height);
    if (audioAnalyser) {
      audioAnalyser.getByteTimeDomainData(audioData);
      waveformCtx.beginPath();
      waveformCtx.strokeStyle = "rgba(255, 78, 66, 0.8)";
      waveformCtx.lineWidth = 2;
      const sliceWidth = width / audioData.length;
      let x = 0;
      for (let i = 0; i < audioData.length; i++) {
        const v = audioData[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) {
          waveformCtx.moveTo(x, y);
        } else {
          waveformCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      waveformCtx.stroke();
    } else {
      waveformCtx.beginPath();
      waveformCtx.strokeStyle = "rgba(255, 78, 66, 0.8)";
      waveformCtx.lineWidth = 1;
      const time = Date.now() / 1000;
      const sliceWidth = width / 100;
      let x = 0;
      for (let i = 0; i < 100; i++) {
        const t = i / 100;
        const y =
          height / 2 +
          Math.sin(t * 10 + time) * 5 +
          Math.sin(t * 20 + time * 1.5) * 3 +
          Math.sin(t * 30 + time * 0.5) * 7 +
          (Math.random() - 0.5) * 2;
        if (i === 0) {
          waveformCtx.moveTo(x, y);
        } else {
          waveformCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      waveformCtx.stroke();
    }
    requestAnimationFrame(drawWaveform);
  }
  drawWaveform();
  let scene, camera, renderer, controls;
  let anomalyObject;
  let distortionAmount = 1.0;
  let resolution = 32;
  let clock = new THREE.Clock();
  let isDraggingAnomaly = false;
  let anomalyVelocity = new THREE.Vector2(0, 0);
  let anomalyTargetPosition = new THREE.Vector3(0, 0, 0);
  let anomalyOriginalPosition = new THREE.Vector3(0, 0, 0);
  let defaultCameraPosition = new THREE.Vector3(0, 0, 10);
  let zoomedCameraPosition = new THREE.Vector3(0, 0, 7);

  function initThreeJS() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.05);
    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.copy(defaultCameraPosition);
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false,
      depth: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById("three-container").appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false; // Disable all camera controls for portfolio presentation
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.7;
    controls.panSpeed = 0.8;
    controls.minDistance = 3;
    controls.maxDistance = 30;
    controls.enableZoom = false;
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    const pointLight1 = new THREE.PointLight(0xff4e42, 1, 10);
    pointLight1.position.set(2, 2, 2);
    scene.add(pointLight1);
    const pointLight2 = new THREE.PointLight(0xc2362f, 1, 10);
    pointLight2.position.set(-2, -2, -2);
    scene.add(pointLight2);
    createAnomalyObject();
    createBackgroundParticles();
    window.addEventListener("resize", onWindowResize);
    // setupAnomalyDragging(); // Disabled for portfolio presentation
    animate();
  }

  function zoomCameraForAudio(zoomIn) {
    const targetPosition = zoomIn
      ? zoomedCameraPosition
      : defaultCameraPosition;
    gsap.to(camera.position, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: 1.5,
      ease: "power2.inOut",
      onUpdate: function () {
        camera.lookAt(0, 0, 0);
      }
    });
    if (zoomIn) {
      addTerminalMessage(
        "CAMERA.ZOOM(TARGET: 0.7, DURATION: 1.5, EASE: 'POWER2.INOUT');",
        true
      );
    } else {
      addTerminalMessage(
        "CAMERA.ZOOM(TARGET: 1.0, DURATION: 1.5, EASE: 'POWER2.INOUT');",
        true
      );
    }
  }

  function setupAnomalyDragging() {
    const container = document.getElementById("three-container");
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragStartPosition = new THREE.Vector2();
    anomalyOriginalPosition = new THREE.Vector3(0, 0, 0);
    anomalyTargetPosition = new THREE.Vector3(0, 0, 0);
    const maxDragDistance = 3;
    container.addEventListener("mousedown", function (event) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(anomalyObject, true);
      if (intersects.length > 0) {
        controls.enabled = false;
        isDragging = true;
        isDraggingAnomaly = true;
        dragStartPosition.x = mouse.x;
        dragStartPosition.y = mouse.y;
        addTerminalMessage(
          "ANOMALY INTERACTION DETECTED. PHYSICS SIMULATION ACTIVE.",
          true
        );
        showNotification("ANOMALY INTERACTION DETECTED");
      }
    });
    container.addEventListener("mousemove", function (event) {
      if (isDragging) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        // Fix the drag direction to match mouse movement
        const deltaX = (mouse.x - dragStartPosition.x) * 5;
        const deltaY = (mouse.y - dragStartPosition.y) * 5;
        anomalyTargetPosition.x += deltaX;
        anomalyTargetPosition.y += deltaY;
        const distance = Math.sqrt(
          anomalyTargetPosition.x * anomalyTargetPosition.x +
            anomalyTargetPosition.y * anomalyTargetPosition.y
        );
        if (distance > maxDragDistance) {
          const scale = maxDragDistance / distance;
          anomalyTargetPosition.x *= scale;
          anomalyTargetPosition.y *= scale;
        }
        anomalyVelocity.x = deltaX * 2;
        anomalyVelocity.y = deltaY * 2;
        dragStartPosition.x = mouse.x;
        dragStartPosition.y = mouse.y;
      }
    });
    container.addEventListener("mouseup", function () {
      if (isDragging) {
        controls.enabled = true;
        isDragging = false;
        isDraggingAnomaly = false;
        addTerminalMessage(
          `INERTIAPLUGIN.TRACK('#ANOMALY', {THROWRESISTANCE: 0.45, VELOCITY: {X: ${anomalyVelocity.x.toFixed(
            2
          )}, Y: ${anomalyVelocity.y.toFixed(2)}}});`,
          true
        );
      }
    });
    container.addEventListener("mouseleave", function () {
      if (isDragging) {
        controls.enabled = true;
        isDragging = false;
        isDraggingAnomaly = false;
      }
    });
  }

  function createBackgroundParticles() {
    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 3000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const color1 = new THREE.Color(0xff4e42);
    const color2 = new THREE.Color(0xc2362f);
    const color3 = new THREE.Color(0xffb3ab);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
      let color;
      const colorChoice = Math.random();
      if (colorChoice < 0.33) {
        color = color1;
      } else if (colorChoice < 0.66) {
        color = color2;
      } else {
        color = color3;
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = 0.05;
    }
    particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    particlesGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );
    particlesGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const particlesMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: {
          value: 0
        }
      },
      vertexShader: `
          attribute float size;
          varying vec3 vColor;
          uniform float time;
          
          void main() {
            vColor = color;
            
            vec3 pos = position;
            pos.x += sin(time * 0.1 + position.z * 0.2) * 0.05;
            pos.y += cos(time * 0.1 + position.x * 0.2) * 0.05;
            pos.z += sin(time * 0.1 + position.y * 0.2) * 0.05;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
      fragmentShader: `
          varying vec3 vColor;
          
          void main() {
            float r = distance(gl_PointCoord, vec2(0.5, 0.5));
            if (r > 0.5) discard;
            
            float glow = 1.0 - (r * 2.0);
            glow = pow(glow, 2.0);
            
            gl_FragColor = vec4(vColor, glow);
          }
        `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);
    return function updateParticles(time) {
      particlesMaterial.uniforms.time.value = time;
    };
  }
  let updateParticles;

  function createAnomalyObject() {
    if (anomalyObject) {
      scene.remove(anomalyObject);
    }
    anomalyObject = new THREE.Group();
    const radius = 2;
    const outerGeometry = new THREE.IcosahedronGeometry(
      radius,
      Math.max(1, Math.floor(resolution / 8))
    );
    const outerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: {
          value: 0
        },
        color: {
          value: new THREE.Color(0xff4e42)
        },
        audioLevel: {
          value: 0
        },
        distortion: {
          value: distortionAmount
        }
      },
      vertexShader: `
      uniform float time;
      uniform float audioLevel;
      uniform float distortion;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      
      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        
        i = mod289(i);
        vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
              
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        
        float slowTime = time * 0.3;
        vec3 pos = position;
        
        float noise = snoise(vec3(position.x * 0.5, position.y * 0.5, position.z * 0.5 + slowTime));
        pos += normal * noise * 0.2 * distortion * (1.0 + audioLevel);
        
        vPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
      fragmentShader: `
      uniform float time;
      uniform vec3 color;
      uniform float audioLevel;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = 1.0 - max(0.0, dot(viewDirection, vNormal));
        fresnel = pow(fresnel, 2.0 + audioLevel * 2.0);
        
        float pulse = 0.8 + 0.2 * sin(time * 2.0);
        
        vec3 finalColor = color * fresnel * pulse * (1.0 + audioLevel * 0.8);
        
        float alpha = fresnel * 0.7;  // Keep transparency constant
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
      wireframe: true,
      transparent: true
    });
    const outerSphere = new THREE.Mesh(outerGeometry, outerMaterial);
    anomalyObject.add(outerSphere);
    scene.add(anomalyObject);
    const glowGeometry = new THREE.SphereGeometry(radius * 1.2, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: {
          value: 0
        },
        color: {
          value: new THREE.Color(0xff4e42)
        },
        audioLevel: {
          value: 0
        }
      },
      vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform float audioLevel;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position * (1.0 + audioLevel * 0.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
      }
    `,
      fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      uniform vec3 color;
      uniform float time;
      uniform float audioLevel;
      
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = 1.0 - max(0.0, dot(viewDirection, vNormal));
        fresnel = pow(fresnel, 3.0 + audioLevel * 3.0);
        
        float pulse = 0.5 + 0.5 * sin(time * 2.0);
        float audioFactor = 1.0 + audioLevel * 3.0;
        
        vec3 finalColor = color * fresnel * (0.8 + 0.2 * pulse) * audioFactor;
        
        float alpha = fresnel * 0.3;  // Keep transparency constant
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    anomalyObject.add(glowSphere);
    return function updateAnomaly(time, audioLevel) {
      outerMaterial.uniforms.time.value = time;
      outerMaterial.uniforms.audioLevel.value = audioLevel;
      outerMaterial.uniforms.distortion.value = distortionAmount;
      glowMaterial.uniforms.time.value = time;
      glowMaterial.uniforms.audioLevel.value = audioLevel;
    };
  }

  function updateWireframeDistortion(amount) {
    distortionAmount = amount;
    updateGlow = createAnomalyObject();
  }

  function updateWireframeResolution(newResolution) {
    resolution = newResolution;
    updateGlow = createAnomalyObject();
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeCanvas();
    resizeCircularCanvas();
    resizeSpectrumCanvas();
  }

  function updateAnomalyPosition() {
    if (!isDraggingAnomaly) {
      anomalyVelocity.x *= 0.95;
      anomalyVelocity.y *= 0.95;
      anomalyTargetPosition.x += anomalyVelocity.x * 0.1;
      anomalyTargetPosition.y += anomalyVelocity.y * 0.1;
      const springStrength = 0.1;
      anomalyVelocity.x -= anomalyTargetPosition.x * springStrength;
      anomalyVelocity.y -= anomalyTargetPosition.y * springStrength;
      if (
        Math.abs(anomalyTargetPosition.x) < 0.05 &&
        Math.abs(anomalyTargetPosition.y) < 0.05
      ) {
        anomalyTargetPosition.set(0, 0, 0);
        anomalyVelocity.set(0, 0);
      }
      const bounceThreshold = 3;
      const bounceDamping = 0.8;
      if (Math.abs(anomalyTargetPosition.x) > bounceThreshold) {
        anomalyVelocity.x = -anomalyVelocity.x * bounceDamping;
        anomalyTargetPosition.x =
          Math.sign(anomalyTargetPosition.x) * bounceThreshold;
        if (Math.abs(anomalyVelocity.x) > 0.1) {
          addTerminalMessage(
            "ANOMALY BOUNDARY COLLISION DETECTED. ENERGY TRANSFER: " +
              (Math.abs(anomalyVelocity.x) * 100).toFixed(0) +
              " UNITS"
          );
        }
      }
      if (Math.abs(anomalyTargetPosition.y) > bounceThreshold) {
        anomalyVelocity.y = -anomalyVelocity.y * bounceDamping;
        anomalyTargetPosition.y =
          Math.sign(anomalyTargetPosition.y) * bounceThreshold;
        if (Math.abs(anomalyVelocity.y) > 0.1) {
          addTerminalMessage(
            "ANOMALY BOUNDARY COLLISION DETECTED. ENERGY TRANSFER: " +
              (Math.abs(anomalyVelocity.y) * 100).toFixed(0) +
              " UNITS"
          );
        }
      }
    }
    anomalyObject.position.x +=
      (anomalyTargetPosition.x - anomalyObject.position.x) * 0.2;
    anomalyObject.position.y +=
      (anomalyTargetPosition.y - anomalyObject.position.y) * 0.2;
    if (!isDraggingAnomaly) {
      anomalyObject.rotation.x += anomalyVelocity.y * 0.01;
      anomalyObject.rotation.y += anomalyVelocity.x * 0.01;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const time = clock.getElapsedTime();
    let audioLevel = 0;
    if (audioAnalyser) {
      audioAnalyser.getByteFrequencyData(frequencyData);
      let sum = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        sum += frequencyData[i];
      }
      // Balanced audio level calculation
      audioLevel = (sum / frequencyData.length / 255) * audioSensitivity * 0.4;
      drawCircularVisualizer();
      drawSpectrumAnalyzer();
      updateAudioWave();
      calculateAudioMetrics();
    }
    updateAnomalyPosition();
    if (updateGlow) {
      updateGlow(time, audioLevel);
    }
    if (updateParticles) {
      updateParticles(time);
    }
    const rotationSpeed = parseFloat(
      document.getElementById("rotation-slider").value
    );
    if (anomalyObject) {
      const audioRotationFactor = 1 + audioLevel * audioReactivity * 0.8;
      anomalyObject.rotation.y += 0.005 * rotationSpeed * audioRotationFactor;
      anomalyObject.rotation.z += 0.002 * rotationSpeed * audioRotationFactor;
    }
    renderer.render(scene, camera);
  }
  initThreeJS();
  updateParticles = createBackgroundParticles();
  updateGlow = createAnomalyObject();
  const rotationSlider = document.getElementById("rotation-slider");
  const resolutionSlider = document.getElementById("resolution-slider");
  const distortionSlider = document.getElementById("distortion-slider");
  const reactivitySlider = document.getElementById("reactivity-slider");
  const sensitivitySlider = document.getElementById("sensitivity-slider");
  rotationSlider.addEventListener("input", function () {
    document.getElementById("rotation-value").textContent = this.value;
  });
  resolutionSlider.addEventListener("input", function () {
    const value = parseInt(this.value);
    document.getElementById("resolution-value").textContent = value;
    updateWireframeResolution(value);
  });
  distortionSlider.addEventListener("input", function () {
    const value = parseFloat(this.value);
    document.getElementById("distortion-value").textContent = value.toFixed(1);
    updateWireframeDistortion(value);
  });
  reactivitySlider.addEventListener("input", function () {
    audioReactivity = parseFloat(this.value);
    document.getElementById(
      "reactivity-value"
    ).textContent = audioReactivity.toFixed(1);
  });
  sensitivitySlider.addEventListener("input", function () {
    audioSensitivity = parseFloat(this.value);
    document.getElementById(
      "sensitivity-value"
    ).textContent = audioSensitivity.toString();
  });
  document.getElementById("reset-btn").addEventListener("click", function () {
    rotationSlider.value = 1.0;
    document.getElementById("rotation-value").textContent = "1.0";
    resolutionSlider.value = 32;
    document.getElementById("resolution-value").textContent = "32";
    distortionSlider.value = 1.0;
    document.getElementById("distortion-value").textContent = "1.0";
    reactivitySlider.value = 1.0;
    document.getElementById("reactivity-value").textContent = "1.0";
    audioReactivity = 1.0;
    sensitivitySlider.value = 5.0;
    document.getElementById("sensitivity-value").textContent = "5.0";
    audioSensitivity = 5.0;
    distortionAmount = 1.0;
    resolution = 32;
    updateGlow = createAnomalyObject();
    anomalyTargetPosition.set(0, 0, 0);
    anomalyVelocity.set(0, 0);
    anomalyObject.position.set(0, 0, 0);
    showNotification("SETTINGS RESET TO DEFAULT VALUES");
  });
  document.getElementById("analyze-btn").addEventListener("click", function () {
    this.textContent = "ANALYZING...";
    this.disabled = true;
    document.getElementById("stability-bar").style.width = "45%";
    document.getElementById("stability-value").textContent = "45%";
    document.getElementById("status-indicator").style.color = "#ff00a0";
    setTimeout(() => {
      this.textContent = "ANALYZE";
      this.disabled = false;
      addTerminalMessage(
        "ANALYSIS COMPLETE. ANOMALY SIGNATURE IDENTIFIED.",
        true
      );
      showNotification("ANOMALY ANALYSIS COMPLETE");
      document.getElementById("mass-value").textContent = (
        Math.random() * 2 +
        1
      ).toFixed(3);
      document.getElementById("energy-value").textContent =
        (Math.random() * 9 + 1).toFixed(1) + "e8 J";
      document.getElementById("variance-value").textContent = (
        Math.random() * 0.01
      ).toFixed(4);
      document.getElementById("peak-value").textContent =
        (Math.random() * 200 + 100).toFixed(1) + " HZ";
      document.getElementById("amplitude-value").textContent = (
        Math.random() * 0.5 +
        0.3
      ).toFixed(2);
      const phases = ["π/4", "π/2", "π/6", "3π/4"];
      document.getElementById("phase-value").textContent =
        phases[Math.floor(Math.random() * phases.length)];
    }, 3000);
  });
  document.querySelectorAll(".demo-track-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      if (!isAudioInitialized) {
        initAudio();
      }
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
      }
      const url = this.dataset.url;
      currentAudioSrc = url;
      document.querySelectorAll(".demo-track-btn").forEach((b) => {
        b.classList.remove("active");
      });
      this.classList.add("active");
      loadAudioFromURL(url);
    });
  });
  document.getElementById("file-btn").addEventListener("click", function () {
    if (!isAudioInitialized) {
      initAudio();
    }
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume();
    }
    document.getElementById("audio-file-input").click();
  });
  document
    .getElementById("audio-file-input")
    .addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        initAudioFile(file);
      }
    });
  // Audio player ended event
  document
    .getElementById("audio-player")
    .addEventListener("ended", function () {
      isAudioPlaying = false;
      zoomCameraForAudio(false);
      addTerminalMessage("AUDIO PLAYBACK COMPLETE.");
    });

  function showNotification(message) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.style.opacity = 1;
    setTimeout(() => {
      notification.style.opacity = 0;
    }, 3000);
  }

  function makePanelDraggable(element, handle = null) {
    Draggable.create(element, {
      type: "x,y",
      edgeResistance: 0.65,
      bounds: document.body,
      handle: handle || element,
      inertia: true,
      throwResistance: 0.85,
      onDragStart: function () {
        const panels = document.querySelectorAll(
          ".terminal-panel, .control-panel, .spectrum-analyzer, .data-panel"
        );
        let maxZ = 10;
        panels.forEach((panel) => {
          const z = parseInt(window.getComputedStyle(panel).zIndex);
          if (z > maxZ) maxZ = z;
        });
        element.style.zIndex = maxZ + 1;
        addTerminalMessage(`PANEL DRAG INITIATED: ${element.className}`);
      },
      onDragEnd: function () {
        addTerminalMessage(
          `DRAGGABLE.INERTIA({TARGET: '${
            element.className
          }', VELOCITY: {X: ${this.getVelocity("x").toFixed(
            2
          )}, Y: ${this.getVelocity("y").toFixed(2)}}});`,
          true
        );
      }
    });
  }
  makePanelDraggable(
    document.querySelector(".control-panel"),
    document.getElementById("control-panel-handle")
  );
  makePanelDraggable(document.querySelector(".terminal-panel"));
  makePanelDraggable(
    document.querySelector(".spectrum-analyzer"),
    document.getElementById("spectrum-handle")
  );
  
  // Desktop initialization moved to top for testing
});