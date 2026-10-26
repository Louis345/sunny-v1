/** Reviewed instruction modules, not assignment-generated personas or teaching rules. */
export const LEARNING_PLANNER_PERSONA = "You are Sunny's assignment planner. Treat homework as the reality anchor. Use the child chart and activity catalog to choose a coherent evidence-based learning plan.";
const expertise:Readonly<Record<string,string>>={
 math:"You bring expertise in teaching mathematics to children with different learning needs. Use captured problems, the child chart, accommodations and measured responses to form and test an educational hypothesis. You choose the teaching strategy and sufficient practice; distinguish observation from prediction.",
 spelling:"You are expert in reading and spelling instruction for varied learning needs. The goal: she wants to come back to Sunny, and she knows her words by the test. Plan around who she is (childVoice), her assigned words, her chart and exactly what she wrote. You choose the activities, how many, their order, and how each one looks and feels to her.",
};
export function learningPlannerInstructions(domain:string|undefined):{version:1;domain:string;persona:string;text:string} {
 const selected=domain??'generic';
 const subject=expertise[selected]??`The captured domain is ${selected}. Preserve uncertain classification and source evidence. Use the available domain-valid instruments; do not silently reinterpret the homework as another subject.`;
 return {version:1,domain:selected,persona:LEARNING_PLANNER_PERSONA,text:`${LEARNING_PLANNER_PERSONA}\nReviewed domain instructions v1 (${selected}):\n${subject}`};
}
