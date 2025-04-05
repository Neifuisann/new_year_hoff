/**
 * Storage Recovery Helper
 * This script helps recover lesson data between stages in case sessionStorage fails
 */

(function() {
    // Wait for page to be fully loaded
    window.addEventListener('load', function() {
        console.log("Storage Recovery: Script loaded");
        
        // Only run on the configuration page
        if (!window.location.pathname.includes('/admin/configure')) {
            console.log("Storage Recovery: Not on configuration page, exiting");
            return;
        }

        // Run after a short delay to let other scripts initialize
        setTimeout(function() {
            try {
                console.log("Storage Recovery: Checking for data");
                
                // Check if main data exists in sessionStorage
                let lessonData = sessionStorage.getItem('lessonStage1Data');
                
                // If session storage failed, try to get the backup from localStorage
                if (!lessonData) {
                    console.log("Storage Recovery: Primary data missing, checking backup");
                    lessonData = localStorage.getItem('lessonStage1Data_backup');
                    
                    if (lessonData) {
                        console.log("Storage Recovery: Found backup data in localStorage");
                        // Restore to sessionStorage
                        sessionStorage.setItem('lessonStage1Data', lessonData);
                        console.log("Storage Recovery: Restored data to sessionStorage");
                    }
                }
                
                // If we have data (either original or recovered), log info
                if (lessonData) {
                    try {
                        const parsed = JSON.parse(lessonData);
                        console.log("Storage Recovery: Data available with " + 
                                   (parsed.questions ? parsed.questions.length : 0) + 
                                   " questions");
                    } catch (e) {
                        console.error("Storage Recovery: Error parsing data", e);
                    }
                } else {
                    console.warn("Storage Recovery: No lesson data found in any storage");
                }
                
                // Inject a debugging utility into the page
                const debugButton = document.createElement('button');
                debugButton.textContent = "Debug Storage";
                debugButton.style.position = "fixed";
                debugButton.style.bottom = "10px";
                debugButton.style.right = "10px";
                debugButton.style.zIndex = "9999";
                debugButton.style.padding = "5px";
                debugButton.style.fontSize = "10px";
                debugButton.style.opacity = "0.5";
                debugButton.onclick = function() {
                    const status = {
                        sessionStorage: {
                            available: false,
                            lessonData: null,
                            parsedQuestions: 0
                        },
                        localStorage: {
                            available: false,
                            lessonData: null,
                            parsedQuestions: 0
                        }
                    };
                    
                    // Test sessionStorage
                    try {
                        sessionStorage.setItem('test', 'test');
                        sessionStorage.removeItem('test');
                        status.sessionStorage.available = true;
                        
                        const data = sessionStorage.getItem('lessonStage1Data');
                        status.sessionStorage.lessonData = !!data;
                        if (data) {
                            const parsed = JSON.parse(data);
                            status.sessionStorage.parsedQuestions = parsed.questions ? parsed.questions.length : 0;
                        }
                    } catch (e) {
                        console.error("SessionStorage test failed:", e);
                    }
                    
                    // Test localStorage
                    try {
                        localStorage.setItem('test', 'test');
                        localStorage.removeItem('test');
                        status.localStorage.available = true;
                        
                        const data = localStorage.getItem('lessonStage1Data_backup');
                        status.localStorage.lessonData = !!data;
                        if (data) {
                            const parsed = JSON.parse(data);
                            status.localStorage.parsedQuestions = parsed.questions ? parsed.questions.length : 0;
                        }
                    } catch (e) {
                        console.error("localStorage test failed:", e);
                    }
                    
                    console.log("Storage Status:", status);
                    alert("Storage Status:\n" + 
                          "SessionStorage: " + (status.sessionStorage.available ? "Available" : "UNAVAILABLE") + 
                          ", Data: " + (status.sessionStorage.lessonData ? "Present" : "MISSING") + 
                          ", Questions: " + status.sessionStorage.parsedQuestions + "\n" +
                          "LocalStorage: " + (status.localStorage.available ? "Available" : "UNAVAILABLE") + 
                          ", Backup: " + (status.localStorage.lessonData ? "Present" : "MISSING") + 
                          ", Questions: " + status.localStorage.parsedQuestions);
                };
                document.body.appendChild(debugButton);
                
            } catch (error) {
                console.error("Storage Recovery: Error in recovery attempt", error);
            }
        }, 1000); // Allow 1 second for page to initialize
    });
})(); 