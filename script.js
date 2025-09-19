// Portfolio JavaScript
// This file contains the basic JavaScript functionality for the portfolio

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the portfolio
    init();
});

function init() {
    console.log('Portfolio loaded successfully!');
    
    // Add smooth scrolling to navigation links
    addSmoothScrolling();
    
    // Add any other initialization code here
}

function addSmoothScrolling() {
    // Get all links that point to sections on the same page
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Utility functions
function showSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
    }
}

function showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'block';
    }
}

// Example function for handling form submissions
function handleContactForm() {
    // Add contact form handling logic here
    console.log('Contact form handler ready');
}

// Example function for project filtering
function filterProjects(category) {
    // Add project filtering logic here
    console.log('Filtering projects by:', category);
}