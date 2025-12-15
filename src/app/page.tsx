import MessageList from './components/MessageList';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            タスク管理メッセージ
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            _タスク管理チャンネルの直近のメッセージ
          </p>
        </header>
        <MessageList />
      </div>
    </div>
  );
}
