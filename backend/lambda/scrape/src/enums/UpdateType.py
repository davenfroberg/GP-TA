from enum import Enum


class UpdateType(Enum):
    NEW_QUESTION = "create"
    INSTRUCTOR_ANSWER = "i_answer"
    STUDENT_ANSWER = "s_answer"
    FOLLOWUP = "followup"
    FEEDBACK = "feedback"
    QUESTION_UPDATE = "update"
    INSTRUCTOR_ANSWER_UPDATE = "i_answer_update"
    STUDENT_ANSWER_UPDATE = "s_answer_update"
