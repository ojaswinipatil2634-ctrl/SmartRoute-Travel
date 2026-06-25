import axios from "axios";
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function getTravelSuggestions(source: string, destination: string, budget: number, userId?: string) {
  try {
    const response = await axios.post('/api/ai/suggestions', {
      source,
      destination,
      budget
    });

    const plan = response.data;

    // Store in Firestore if userId is provided
    if (userId) {
      await addDoc(collection(db, "trips"), {
        userId,
        title: `Trip to ${destination}`,
        source,
        destination,
        totalCost: plan.totalEstimatedCost,
        items: [], // Can be populated later
        createdAt: new Date().toISOString(),
        aiGenerated: true,
        plan
      });
    }

    return plan;
  } catch (error) {
    console.error("AI Service Error:", error);
    return null;
  }
}

export async function chatWithAssistant(message: string, userId: string, history: any[] = []) {
  try {
    const response = await axios.post('/api/ai/chat', {
      message,
      history
    });

    const reply = response.data.reply;

    // Store messages in Firestore
    await addDoc(collection(db, "chat_history"), {
      userId,
      role: "user",
      text: message,
      timestamp: serverTimestamp()
    });

    await addDoc(collection(db, "chat_history"), {
      userId,
      role: "assistant",
      text: reply,
      timestamp: serverTimestamp()
    });

    return reply;
  } catch (error) {
    console.error("Chat Error:", error);
    return "I'm sorry, I'm having trouble connecting right now. Please try again later.";
  }
}
