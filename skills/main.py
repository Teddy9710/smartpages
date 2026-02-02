"""
通义万相图像生成技能
通过阿里云DashScope API生成图像
"""

import requests
import json
import time
import os
from typing import Optional
import threading
import uuid

class WanxiangImageGenerator:
    def __init__(self, api_key: str = None):
        """
        初始化图像生成器
        
        Args:
            api_key: DashScope API密钥
        """
        self.api_key = api_key or "sk-"
        self.base_url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
        self.task_url = "https://dashscope.aliyuncs.com/api/v1/tasks/"
        
    def generate_image(self, 
                      prompt: str, 
                      size: str = "1024*1024", 
                      model: str = "qwen-image-plus",
                      n: int = 1,
                      style: str = None,
                      quality: str = None) -> dict:
        """
        使用通义万相API生成图像
        
        Args:
            prompt: 图像生成提示词
            size: 图像尺寸，默认"1024*1024"
            model: 使用的模型，默认"qwen-image-plus"
            n: 生成图片数量，默认1张
            style: 图片风格（可选）
            quality: 图片质量（可选）
        
        Returns:
            包含结果的字典
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable"
        }
        
        # 构建请求数据
        data = {
            "model": model,
            "input": {
                "prompt": prompt
            },
            "parameters": {
                "size": size,
                "n": min(n, 4)  # 限制最大生成数量为4
            }
        }
        
        # 添加可选参数
        if style:
            data["parameters"]["style"] = style
        if quality:
            data["parameters"]["quality"] = quality
        
        result = {
            "success": False,
            "image_paths": [],
            "task_id": None,
            "error": None,
            "details": {}
        }
        
        try:
            print(f"正在生成图片: {prompt}")
            
            # 提交异步任务
            response = requests.post(self.base_url, headers=headers, json=data, timeout=30)
            
            if response.status_code != 200:
                result["error"] = f"API请求失败: {response.status_code}, {response.text}"
                return result
            
            response_data = response.json()
            if 'output' not in response_data or 'task_id' not in response_data['output']:
                result["error"] = "API响应中没有任务ID"
                return result
            
            task_id = response_data['output']['task_id']
            result["task_id"] = task_id
            print(f"异步任务已创建: {task_id}")
            
            # 等待任务完成，最多等待180秒
            timeout = 180
            start_time = time.time()
            while time.time() - start_time < timeout:
                task_result = self._check_task_status(task_id)
                if task_result is None:
                    # 如果检查任务状态失败，稍作延迟后重试
                    print("检查任务状态失败，稍后重试...")
                    time.sleep(5)
                    continue
                
                status = task_result.get('output', {}).get('task_status', 'unknown')
                print(f"任务状态: {status}")
                
                if status == 'SUCCEEDED':
                    # 任务成功，下载图片
                    if 'output' in task_result and 'results' in task_result['output']:
                        image_urls = []
                        for result_item in task_result['output']['results']:
                            if 'url' in result_item:
                                image_urls.append(result_item['url'])
                        
                        # 下载所有生成的图片
                        downloaded_paths = []
                        for i, image_url in enumerate(image_urls):
                            print(f"正在下载图片 {i+1}: {image_url}")
                            
                            # 下载图片
                            img_response = requests.get(image_url)
                            if img_response.status_code == 200:
                                # 使用UUID生成唯一文件名
                                unique_id = str(uuid.uuid4())[:8]
                                filename = f"wanxiang_output_{int(time.time())}_{unique_id}_{i+1}.png"
                                filepath = os.path.join("/root/clawd", filename)
                                with open(filepath, 'wb') as f:
                                    f.write(img_response.content)
                                
                                downloaded_paths.append(filepath)
                                print(f"图片已保存为: {filepath}")
                            else:
                                result["error"] = f"下载第{i+1}张图片失败"
                                return result
                        
                        result["success"] = True
                        result["image_paths"] = downloaded_paths
                        result["details"]["original_prompt"] = task_result.get('input', {}).get('prompt', prompt)
                        result["details"]["actual_prompt"] = task_result.get('output', {}).get('results', [{}])[0].get('actual_prompt', '')
                        print(f"成功生成 {len(downloaded_paths)} 张图片")
                        return result
                    break
                elif status in ['FAILED', 'CANCELED']:
                    result["error"] = f"任务失败或被取消: {status}"
                    if 'message' in task_result:
                        result["error"] += f", 错误信息: {task_result['message']}"
                    return result
                else:
                    print("任务仍在进行中...")
                    time.sleep(5)  # 等待5秒后再次检查
            
            result["error"] = "任务超时"
            return result
            
        except requests.exceptions.RequestException as e:
            result["error"] = f"网络请求异常: {str(e)}"
            return result
        except Exception as e:
            result["error"] = f"生成图像时发生错误: {str(e)}"
            return result

    def _check_task_status(self, task_id: str) -> Optional[dict]:
        """检查任务状态"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(f"{self.task_url}{task_id}", headers=headers, timeout=15)
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"查询任务状态失败: {response.status_code}, {response.text}")
                return None
        except Exception as e:
            print(f"检查任务状态时发生错误: {str(e)}")
            return None

    def generate_image_sync(self, 
                          prompt: str, 
                          size: str = "1024*1024", 
                          model: str = "qwen-image-plus",
                          n: int = 1,
                          style: str = None,
                          quality: str = None) -> dict:
        """
        同步版本的图像生成（阻塞直到完成）
        """
        # 移除异步头，直接同步生成
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
            # 不设置 X-DashScope-Async，使用同步模式
        }
        
        data = {
            "model": model,
            "input": {
                "prompt": prompt
            },
            "parameters": {
                "size": size,
                "n": min(n, 4)
            }
        }
        
        if style:
            data["parameters"]["style"] = style
        if quality:
            data["parameters"]["quality"] = quality
        
        result = {
            "success": False,
            "image_paths": [],
            "error": None,
            "details": {}
        }
        
        try:
            print(f"正在同步生成图片: {prompt}")
            
            # 发送同步请求
            response = requests.post(self.base_url, headers=headers, json=data, timeout=120)
            
            if response.status_code != 200:
                result["error"] = f"API请求失败: {response.status_code}, {response.text}"
                return result
            
            response_data = response.json()
            
            if 'output' in response_data and 'results' in response_data['output']:
                # 直接处理结果
                downloaded_paths = []
                for i, result_item in enumerate(response_data['output']['results']):
                    if 'url' in result_item:
                        image_url = result_item['url']
                        print(f"正在下载图片 {i+1}: {image_url}")
                        
                        # 下载图片
                        img_response = requests.get(image_url)
                        if img_response.status_code == 200:
                            unique_id = str(uuid.uuid4())[:8]
                            filename = f"wanxiang_output_{int(time.time())}_{unique_id}_{i+1}.png"
                            filepath = os.path.join("/root/clawd", filename)
                            with open(filepath, 'wb') as f:
                                f.write(img_response.content)
                            
                            downloaded_paths.append(filepath)
                            print(f"图片已保存为: {filepath}")
                        else:
                            result["error"] = f"下载第{i+1}张图片失败"
                            return result
                
                result["success"] = True
                result["image_paths"] = downloaded_paths
                result["details"]["original_prompt"] = response_data.get('input', {}).get('prompt', prompt)
                result["details"]["actual_prompt"] = response_data.get('output', {}).get('results', [{}])[0].get('actual_prompt', '')
                return result
            else:
                result["error"] = "API响应中没有图片结果"
                return result
                
        except Exception as e:
            result["error"] = f"同步生成图像时发生错误: {str(e)}"
            return result


def run_skill(args: dict) -> dict:
    """
    技能运行入口
    
    Args:
        args: 包含参数的字典
               - prompt: 图像生成提示词 (必需)
               - size: 图像尺寸 (可选, 默认 "1024*1024")
               - model: 模型名称 (可选, 默认 "qwen-image-plus")
               - n: 生成图片数量 (可选, 默认 1)
               - style: 图片风格 (可选)
               - quality: 图片质量 (可选)
               - sync: 是否使用同步模式 (可选, 默认 False)
    
    Returns:
        技能执行结果
    """
    prompt = args.get("prompt")
    if not prompt:
        return {"error": "缺少必需的参数: prompt"}
    
    size = args.get("size", "1024*1024")
    model = args.get("model", "qwen-image-plus")
    n = args.get("n", 1)
    style = args.get("style")
    quality = args.get("quality")
    sync_mode = args.get("sync", False)
    api_key = args.get("api_key")  # 可选，如果不提供则使用默认值
    
    # 确保尺寸格式正确（使用*而不是x）
    if 'x' in size:
        size = size.replace('x', '*')
    
    generator = WanxiangImageGenerator(api_key)
    
    if sync_mode:
        result = generator.generate_image_sync(prompt, size, model, n, style, quality)
    else:
        result = generator.generate_image(prompt, size, model, n, style, quality)
    
    if result["success"]:
        return {
            "success": True,
            "image_paths": result["image_paths"],
            "task_id": result.get("task_id"),  # 异步模式下有task_id
            "original_prompt": result["details"].get("original_prompt"),
            "actual_prompt": result["details"].get("actual_prompt"),
            "image_count": len(result["image_paths"])
        }
    else:
        return {
            "success": False,
            "error": result["error"],
            "task_id": result.get("task_id")
        }


# 测试函数
def test_skill():
    """测试技能功能"""
    test_args = {
        "prompt": "一只会飞的泰迪熊，名叫SuperTeddy，身穿斗篷，可爱又英勇，飞翔在天空中，卡通风格，高清细节",
        "n": 1,
        "size": "1024*1024",
        "model": "qwen-image-plus"
    }
    
    result = run_skill(test_args)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    test_skill()
