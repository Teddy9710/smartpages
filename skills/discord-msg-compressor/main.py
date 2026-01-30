"""
Discord消息压缩技能
实现Discord消息历史的滑动窗口管理和摘要归档功能
"""

import json
import os
import time
from datetime import datetime
from typing import Dict, List, Optional
import asyncio

class DiscordMessageCompressor:
    def __init__(self, window_size: int = 10, summary_threshold: int = 20):
        """
        初始化Discord消息压缩器
        
        Args:
            window_size: 滑动窗口大小，保留最近的消息数
            summary_threshold: 达到此数量时触发摘要转换
        """
        self.window_size = window_size
        self.summary_threshold = summary_threshold
        self.messages = []  # 存储当前窗口的消息
        self.archived_summaries = []  # 存储归档的摘要
        self.message_count = 0  # 总消息计数
        
    def add_message(self, message: Dict) -> Dict:
        """
        添加新消息到历史记录
        
        Args:
            message: 消息字典，应包含id, content, author, timestamp等字段
            
        Returns:
            包含操作结果的字典
        """
        # 添加时间戳如果不存在
        if 'timestamp' not in message:
            message['timestamp'] = datetime.now().isoformat()
        
        # 添加消息到列表
        self.messages.append(message)
        self.message_count += 1
        
        result = {
            "added": True,
            "message_id": message.get('id', len(self.messages)),
            "current_window_size": len(self.messages),
            "should_summarize": False,
            "summary_created": None
        }
        
        # 检查是否需要创建摘要
        if len(self.messages) >= self.summary_threshold:
            result['should_summarize'] = True
            summary_result = self.create_summary()
            result['summary_created'] = summary_result
            
            # 清空消息窗口，只保留最近的window_size条消息
            if len(self.messages) > self.window_size:
                removed_count = len(self.messages) - self.window_size
                self.messages = self.messages[-self.window_size:]
                result['window_reset'] = True
                result['messages_removed'] = removed_count
        
        # 保持窗口大小
        if len(self.messages) > self.window_size:
            self.messages.pop(0)
        
        return result
    
    def create_summary(self) -> Dict:
        """
        创建当前消息的摘要
        
        Returns:
            摘要结果字典
        """
        if not self.messages:
            return {"success": False, "error": "没有消息可用于摘要"}
        
        # 提取关键信息用于摘要
        summary_data = {
            "start_time": self.messages[0].get('timestamp', ''),
            "end_time": self.messages[-1].get('timestamp', ''),
            "message_count": len(self.messages),
            "participants": list(set(msg.get('author', 'Unknown') for msg in self.messages)),
            "topics": self._extract_topics(),
            "key_points": self._extract_key_points()
        }
        
        # 创建摘要对象
        summary_obj = {
            "id": f"summary_{int(time.time())}_{len(self.archived_summaries)+1}",
            "created_at": datetime.now().isoformat(),
            "summary_data": summary_data,
            "original_message_count": len(self.messages)
        }
        
        self.archived_summaries.append(summary_obj)
        
        return {
            "success": True,
            "summary_id": summary_obj['id'],
            "summary_data": summary_data,
            "archived_count": len(self.archived_summaries)
        }
    
    def _extract_topics(self) -> List[str]:
        """从消息中提取话题"""
        topics = set()
        for msg in self.messages:
            content = msg.get('content', '').lower()
            # 简单的话题提取逻辑
            if 'image' in content or 'picture' in content or 'photo' in content:
                topics.add('image_generation')
            if 'code' in content or 'program' in content or 'python' in content:
                topics.add('coding')
            if '?' in content:
                topics.add('question')
            if 'thank' in content:
                topics.add('appreciation')
        
        return list(topics)[:5]  # 最多返回5个话题
    
    def _extract_key_points(self) -> List[str]:
        """从消息中提取关键点"""
        key_points = []
        for i, msg in enumerate(self.messages):
            content = msg.get('content', '')
            if len(content) > 20:  # 只提取较长的消息作为关键点
                # 截断过长的内容
                snippet = content[:100] + "..." if len(content) > 100 else content
                key_points.append(snippet)
        
        return key_points[:10]  # 最多返回10个关键点
    
    def get_current_context(self) -> Dict:
        """
        获取当前上下文（包括最近的消息和摘要）
        
        Returns:
            包含当前上下文的字典
        """
        return {
            "recent_messages": self.messages,
            "archived_summaries": self.archived_summaries[-5:],  # 最近5个摘要
            "total_messages_processed": self.message_count,
            "current_window_size": len(self.messages),
            "total_archived_summaries": len(self.archived_summaries)
        }
    
    def export_context(self, filepath: str = None) -> str:
        """
        导出当前上下文到JSON文件
        
        Args:
            filepath: 输出文件路径，如果不提供则自动生成
            
        Returns:
            文件路径
        """
        if not filepath:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = f"/root/clawd/discord_context_{timestamp}.json"
        
        context = self.get_current_context()
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(context, f, ensure_ascii=False, indent=2)
        
        return filepath
    
    def import_context(self, filepath: str):
        """
        从JSON文件导入上下文
        
        Args:
            filepath: 输入文件路径
        """
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.messages = data.get('recent_messages', [])
        self.archived_summaries = data.get('archived_summaries', [])
        self.message_count = data.get('total_messages_processed', len(self.messages))


def run_skill(args: dict) -> dict:
    """
    技能运行入口
    
    Args:
        args: 包含参数的字典
               - action: 操作类型 (add_message, get_context, export, import)
               - message: 要添加的消息 (当action=add_message时)
               - filepath: 文件路径 (当action=export/import时)
    
    Returns:
        技能执行结果
    """
    action = args.get('action', 'get_context')
    
    # 从持久化存储加载或创建新的压缩器实例
    compressor = _load_compressor()
    
    if action == 'add_message':
        message = args.get('message')
        if not message:
            return {"success": False, "error": "缺少消息数据"}
        
        result = compressor.add_message(message)
        _save_compressor(compressor)
        return {"success": True, **result}
    
    elif action == 'get_context':
        context = compressor.get_current_context()
        return {"success": True, "context": context}
    
    elif action == 'export':
        filepath = args.get('filepath')
        exported_path = compressor.export_context(filepath)
        return {"success": True, "exported_path": exported_path}
    
    elif action == 'import':
        filepath = args.get('filepath')
        if not filepath:
            return {"success": False, "error": "缺少文件路径"}
        
        try:
            compressor.import_context(filepath)
            _save_compressor(compressor)
            return {"success": True, "message": f"上下文已从 {filepath} 导入"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    else:
        return {"success": False, "error": f"不支持的操作: {action}"}


def _load_compressor() -> DiscordMessageCompressor:
    """从持久化存储加载压缩器实例"""
    filepath = "/root/clawd/discord_message_compressor_state.json"
    
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            compressor = DiscordMessageCompressor(
                window_size=data.get('window_size', 10),
                summary_threshold=data.get('summary_threshold', 20)
            )
            compressor.messages = data.get('messages', [])
            compressor.archived_summaries = data.get('archived_summaries', [])
            compressor.message_count = data.get('message_count', 0)
            
            return compressor
        except Exception:
            pass  # 如果加载失败，则创建新实例
    
    # 创建新实例
    return DiscordMessageCompressor()


def _save_compressor(compressor: DiscordMessageCompressor):
    """保存压缩器实例到持久化存储"""
    filepath = "/root/clawd/discord_message_compressor_state.json"
    
    data = {
        'window_size': compressor.window_size,
        'summary_threshold': compressor.summary_threshold,
        'messages': compressor.messages,
        'archived_summaries': compressor.archived_summaries,
        'message_count': compressor.message_count
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def test_skill():
    """测试技能功能"""
    # 测试添加消息
    test_message = {
        "id": "test_msg_1",
        "author": "TestUser",
        "content": "Hello, this is a test message for the Discord message compressor!",
        "timestamp": datetime.now().isoformat()
    }
    
    result = run_skill({
        "action": "add_message",
        "message": test_message
    })
    
    print("添加消息结果:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # 测试获取上下文
    context_result = run_skill({"action": "get_context"})
    
    print("\n获取上下文结果:")
    print(json.dumps(context_result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    test_skill()