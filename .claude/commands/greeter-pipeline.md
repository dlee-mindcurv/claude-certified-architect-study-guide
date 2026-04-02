Run the following steps sequentially. Do NOT run them in parallel.

## Step 1: Jamaican Greeter
Use the Agent tool with `subagent_type: "jamaican-greeter"` to greet the user. Pass the following as the prompt:

> $ARGUMENTS

Wait for the agent to complete and save its full response.

## Step 2: Pirate Greeter
Use the Agent tool with `subagent_type: "pirate-greeter"`. Pass the **full response from Step 1** as the prompt. Do NOT modify the response — pass it exactly as received.

Wait for the agent to complete and save its full response.

## Step 3: Display Output
Display the pirate-greeter's response from Step 2, then write a short original poem about pizza (4-6 lines).