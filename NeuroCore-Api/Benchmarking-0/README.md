






Model :


openai-community/gpt2

microsoft/phi-2

distilgpt2

TinyLlama/TinyLlama-1.1B-Chat-v1.0






Dataset to its corresponding task type



| Dataset Name      | Task Type              | Description                         | Input Field(s)     | Output Field(s) |
| ----------------- | ---------------------- | ----------------------------------- | ------------------ | --------------- |
| abisee/cnn_dailymail           | summarization          | Text summarization task             | article            | highlights      |
| EdinburghNLP/xsum              | summarization          | Text summarization task             | document           | summary         |
| FiscalNote/billsum           | summarization          | Text summarization task             | text               | summary         |
| knkarthick/samsum            | dialogue_summarization | Dialogue/conversation summarization | dialogue           | summary         |
| alexfabbri/multi_news        | summarization          | Text summarization task             | document           | summary         |
| rajpurkar/squad             | question_answering     | Question answering based on context | context, question  | answers         |
| rajpurkar/squad_v2          | question_answering     | Question answering based on context | context, question  | answers         |
| sentence-transformers/eli5              | open_qa                | Open-domain question answering      | title              | answers         |
| sentence-transformers/natural-questions | question_answering     | Question answering based on context | document, question | annotations     |
| dair-ai/emotion           | classification         | Text classification task            | text               | label           |
