function haltFunctionAi() {
    for (const [requestId, requestInfo] of activeRequests.entries()) {
        if (requestInfo.type === 'function') {
            requestInfo.controller.abort();
            activeRequests.delete(requestId);
        }
    }

    isAiProcessing = false; // Ensure the state is updated

    if (functionSendSvg) {
        functionSendSvg.innerHTML = `<use xlink:href="#play-icon"></use>`;
    }
}



let isAiProcessing = false;

const functionSendSvg = functionSendButton.querySelector('svg');
const functionPrompt = document.getElementById('function-prompt');

functionSendButton.addEventListener('click', () => {
    if (isAiProcessing) {
        haltFunctionAi();
    } else {
        requestFunctionCall();
    }
});

functionPrompt.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        // Prevent the default action to avoid form submission
        event.preventDefault();

        // Call the function to handle sending the message
        requestFunctionCall();
    }
});

// Define a global variable to store the most recent message
let mostRecentFunctionMessage = "";

// Event listener for the regen button
functionRegenButton.addEventListener('click', () => {
    // Set the function prompt's value to the most recent message
    functionPrompt.value = mostRecentFunctionMessage;
});

// Function to update the most recent message
function updateMostRecentMessage(newMessage) {
    mostRecentFunctionMessage = newMessage;
}

// Function to handle new message requests
async function requestFunctionCall() {
    let userMessage = functionPrompt.value.trim();
    // Update the most recent message
    updateMostRecentMessage(userMessage);
    // If the textarea is empty, prompt the user for input
    if (userMessage === '') {
        userMessage = prompt("Enter message:");

        // Check if the user provided input or cancelled the prompt
        if (userMessage === null || userMessage.trim() === '') {
            console.log("No input provided. Request cancelled.");
            return;
        }

        // Optional: Set the textarea with the new message
        functionPrompt.value = userMessage;
    }

    functionPrompt.value = '';

    // Dispatching the input event
    const event = new Event('input', { bubbles: true, cancelable: true });
    functionPrompt.dispatchEvent(event);

    const neuralTelemetryPrompt = createTelemetryPrompt(neuralTelemetry, false);
    let systemMessages = [
        { role: "system", content: neuriteNeuralApiPrompt },
        { role: "system", content: neuralTelemetryPrompt }
    ];

    const maxContextSize = document.getElementById('max-context-size-slider').value;

    // Apply trimming to system messages, excluding the user message from the trimming process
    systemMessages = trimSystemMessages(systemMessages, maxContextSize);

    const requestMessages = systemMessages.concat({ role: "user", content: userMessage });

    // Call the new function to handle the API call
    await getFunctionResponse(requestMessages);
}

function trimSystemMessages(systemMessages, maxTokens) {
    // Calculate the total token count for system messages
    let totalTokenCount = getTokenCount(systemMessages);

    // Trim system messages if necessary
    if (totalTokenCount > maxTokens) {
        for (let i = systemMessages.length - 1; i >= 0; i--) {
            systemMessages[i].content = trimToTokenCount(systemMessages[i].content, maxTokens);
            totalTokenCount = getTokenCount(systemMessages);

            if (totalTokenCount <= maxTokens) {
                break; // Stop trimming if the token limit is achieved
            }
        }
    }

    return systemMessages;
}


async function getFunctionResponse(requestMessages) {
    const requestId = generateRequestId();
    let streamedResponse = "";

    function onBeforeCall() {
        isAiProcessing = true;
        updateUiForProcessing();
    }

    function onAfterCall() {
        isAiProcessing = false;
        updateUiForIdleState();
    }

    function onStreamingResponse(content) {
        // Verify if the request is still active
        if (!activeRequests.has(requestId)) return;

        neuriteFunctionCM.getDoc().replaceRange(content, CodeMirror.Pos(neuriteFunctionCM.lastLine()));
        streamedResponse += content;
    }

    function onError(error) {
        functionErrorIcon.style.display = 'block';
        console.error("Error:", error);
    }

    // Initialize AbortController for Function Request
    const controller = new AbortController();
    activeRequests.set(requestId, { type: 'function', controller });

    try {
        const responseData = await callAiApi({
            messages: requestMessages,
            stream: true,
            customTemperature: null,
            onBeforeCall,
            onAfterCall,
            onStreamingResponse,
            onError,
            controller, // Pass the controller
            requestId // Pass the unique requestId
        });
        return streamedResponse || responseData;
    } finally {
        // Clean up after the request is done
        activeRequests.delete(requestId);
    }
}

function updateUiForProcessing() {
    // Update UI elements to reflect processing state
    functionSendSvg.innerHTML = `<use xlink:href="#pause-icon"></use>`;
    functionLoadingIcon.style.display = 'block';
    functionErrorIcon.style.display = 'none';

    neuriteFunctionCM.setValue('');
}

function updateUiForIdleState() {
    // Update UI elements to reflect idle state
    functionSendSvg.innerHTML = `<use xlink:href="#play-icon"></use>`;
    functionLoadingIcon.style.display = 'none';
}

