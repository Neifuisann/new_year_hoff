const bcrypt = require('bcrypt');

async function generateHash() {
    const passwordToHash = 'hoff'; // **CHANGE THIS TO YOUR DESIRED ADMIN PASSWORD**
    const saltRounds = 10;

    try {
        const hashedPassword = await bcrypt.hash(passwordToHash, saltRounds);
        console.log("Generated Bcrypt Hash:", hashedPassword);
        // You can then copy this hash and paste it into your adminCredentials
    } catch (err) {
        console.error("Error generating hash:", err);
    }
}

generateHash(); // Call the function to generate the hash when the script runs